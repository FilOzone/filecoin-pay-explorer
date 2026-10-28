/**
 * The `/console/setup` link: one request from a CLI to set up the connected
 * wallet. Every value is untrusted URL input and parsing never throws. The
 * parameter names are a contract shared with the CLIs:
 *
 * `/console/setup?network=<mainnet|calibration>[&authorize=<address>&scopes=<ids>[&name=][&days=][&pubkey=<0x04…>&pubkeysig=<0x…>]][&deposit=<amount>][&balance=<amount>][&operator=fwss][&approval=unlimited]`
 *
 * `signer` is read as `authorize`, as the `fil` CLI names it. Older links to
 * `/console/session-keys?authorize=` and `/console?deposit=` are redirected
 * here by {@link legacySetupPath}.
 */
import { type Hex, verifyMessage } from "viem";
import type { Network } from "@/types";
import {
  type AuthorizeParamError,
  parseAuthorizeParam,
  parseDaysParam,
  parseNetworkParam,
  parseScopesParam,
} from "./authorizeParam";
import { parseDepositParam, parseOperatorParam } from "./depositParam";
import { normalizeKeyName, type ScopeId } from "./sessionKeys";

export const SETUP_PATH = "/console/setup";

/** Why a setup link was refused. Any one of them refuses the whole request. */
export type SetupLinkError =
  | AuthorizeParamError
  | "bad-deposit"
  | "bad-balance"
  | "bad-operator"
  | "bad-approval"
  | "pubkey-without-key"
  | "bad-pubkey"
  | "bad-pubkeysig"
  | "bad-node";

export interface SessionKeyRequest {
  address: `0x${string}`;
  scopes: ScopeId[];
  /** Suggested key name; optional, so a missing or unusable one never refuses the link. The owner can edit it. */
  name: string | null;
  /** Suggested expiry in days; optional like `name`, and editable. */
  days: number | null;
}

/**
 * The session key's Keysmith key-agreement key, which a group key Grant is
 * wrapped to. It does not hash to the key's address, so the session key signs
 * it; the page checks that signature ({@link verifyKeyAgreementKey}) before
 * asking the wallet for anything.
 */
export interface KeyAgreementRequest {
  /** Uncompressed secp256k1 point, lowercase: `0x04` and 128 hex digits. */
  pubkey: Hex;
  /** The session key's EIP-191 signature over {@link keyAgreementMessage}, lowercase. */
  pubkeysig: Hex;
  /** The Keysmith node the Grant opens. This page issues whole group keys only. */
  node: "keyspace";
}

export interface SetupRequest {
  /** The network the request is for; null only for a bare link, which sets up the wallet's own network. */
  network: Network | null;
  /** The session key to authorize; null when the link asks for none. */
  sessionKey: SessionKeyRequest | null;
  /** Asks for a group key Grant to the session key; null when the link names no `pubkey`. */
  keyAgreement: KeyAgreementRequest | null;
  /** Decimal USDFC amount to add on top of what Filecoin Pay holds, e.g. "2"; null when the link names none. */
  deposit: string | null;
  /**
   * Decimal USDFC the tool needs available in Filecoin Pay once funded, so the
   * page can tell when that is reached; null when the link names none.
   */
  balance: string | null;
  /**
   * The link asks only for the Warm Storage approval: it names the operator or
   * the approval but no deposit or balance. Any other link also sets up funds,
   * at the amount it names or any balance at all.
   */
  approvalOnly: boolean;
  /**
   * `approval=unlimited`: Warm Storage counts as approved only with unlimited
   * allowances, which tools built on synapse-core need before they upload.
   * Without it, any approval counts, and the owner's own limits stand.
   */
  unlimitedApproval: boolean;
}

const REQUEST_PARAMS = [
  "network",
  "authorize",
  "signer",
  "scopes",
  "deposit",
  "balance",
  "operator",
  "approval",
  "pubkey",
  "pubkeysig",
  "node",
] as const;

/**
 * The whole request from a page's search params, or the first reason it
 * cannot be used. A partial request is never set up: an address, network,
 * scope list, amount or operator the link names but that cannot be read
 * refuses everything, rather than setting up something the link never asked for.
 */
export function parseSetupLink(params: URLSearchParams): SetupRequest | { error: SetupLinkError } {
  if (!REQUEST_PARAMS.some((key) => params.has(key))) {
    return {
      network: null,
      sessionKey: null,
      keyAgreement: null,
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    };
  }

  let sessionKey: SessionKeyRequest | null = null;
  // Scopes without an address is still a session-key request, just a broken one.
  if (params.has("authorize") || params.has("signer") || params.has("scopes")) {
    const requested = parseAuthorizeParam(params.get("authorize") ?? params.get("signer")) ?? {
      error: "not-an-address" as const,
    };
    if ("error" in requested) return requested;
    sessionKey = {
      address: requested.address,
      // Checked after the network below, so a link with neither reports the network.
      scopes: parseScopesParam(params.get("scopes")) ?? [],
      name: normalizeKeyName(params.get("name") ?? "") || null,
      days: parseDaysParam(params.get("days")),
    };
  }

  // The CLIs always send one: without it, a calibration link approved by a
  // mainnet wallet would grant on mainnet.
  const network = parseNetworkParam(params.get("network"));
  if (!network) return { error: "no-network" };
  // Reduce-only consent has nothing to reduce to without a scope.
  if (sessionKey && sessionKey.scopes.length === 0) return { error: "no-scopes" };

  let deposit: string | null = null;
  if (params.has("deposit")) {
    // Named but empty or zero is not "no deposit": the link asked for an amount it did not give.
    deposit = parseDepositParam(params.get("deposit"));
    if (!deposit) return { error: "bad-deposit" };
  }
  let balance: string | null = null;
  if (params.has("balance")) {
    balance = parseDepositParam(params.get("balance"));
    if (!balance) return { error: "bad-balance" };
  }
  // Warm Storage is the only operator a link can name, and the page always offers it.
  if (params.has("operator") && !parseOperatorParam(params.get("operator"))) return { error: "bad-operator" };
  // Named but misspelled is refused, not read as "any approval": the tool would then refuse to upload.
  const approval = params.get("approval");
  if (approval !== null && approval.trim().toLowerCase() !== "unlimited") return { error: "bad-approval" };

  let keyAgreement: KeyAgreementRequest | null = null;
  if (params.has("pubkey") || params.has("pubkeysig") || params.has("node")) {
    // The Grant goes to the session key the link authorizes; there is nothing to give it to otherwise.
    if (!sessionKey) return { error: "pubkey-without-key" };
    const pubkey = params.get("pubkey")?.trim().toLowerCase() ?? "";
    // Format only: Keysmith rejects a point off the curve when it wraps the Grant.
    if (!/^0x04[0-9a-f]{128}$/.test(pubkey)) return { error: "bad-pubkey" };
    const pubkeysig = params.get("pubkeysig")?.trim().toLowerCase() ?? "";
    if (!/^0x[0-9a-f]{130}$/.test(pubkeysig)) return { error: "bad-pubkeysig" };
    // This version issues whole group keys only. Anything else is refused, so a tool asking for
    // a narrower part of the keyspace never gets the whole group key from an older console.
    if (params.get("node") !== "keyspace") return { error: "bad-node" };
    keyAgreement = { pubkey: pubkey as Hex, pubkeysig: pubkeysig as Hex, node: "keyspace" };
  }

  return {
    network,
    sessionKey,
    keyAgreement,
    deposit,
    balance,
    approvalOnly: deposit === null && balance === null && (params.has("operator") || approval !== null),
    unlimitedApproval: approval !== null,
  };
}

/**
 * Where an older CLI link now opens: the session keys page's `?authorize=`
 * and the dashboard's `?deposit=` / `?operator=` links both move to the setup
 * page with their query intact. A `?revoke=` link stays on the session keys
 * page, where the key list it acts on lives. null when the path is not one.
 */
export function legacySetupPath(pathname: string, params: URLSearchParams): string | null {
  const isPairing =
    pathname === "/console/session-keys" && !params.has("revoke") && (params.has("authorize") || params.has("scopes"));
  const isFunding = pathname === "/console" && (params.has("deposit") || params.has("operator"));
  return isPairing || isFunding ? `${SETUP_PATH}?${params.toString()}` : null;
}

/** What the session key signs over its key-agreement key. Shared with the CLIs. */
export const keyAgreementMessage = (pubkey: Hex) => `Keysmith key agreement key: ${pubkey.toLowerCase()}`;

/** Whether the session key at `address` signed `pubkey` as its key-agreement key. Never throws. */
export function verifyKeyAgreementKey(
  address: Hex,
  { pubkey, pubkeysig }: Pick<KeyAgreementRequest, "pubkey" | "pubkeysig">,
): Promise<boolean> {
  return verifyMessage({ address, message: keyAgreementMessage(pubkey), signature: pubkeysig }).catch(() => false);
}
