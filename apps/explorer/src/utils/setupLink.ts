/**
 * The `/console/setup` link: one request from a CLI to set up the connected
 * wallet. Every value is untrusted URL input and parsing never throws. The
 * parameter names are a contract shared with the CLIs:
 *
 * `/console/setup?network=<mainnet|calibration>[&authorize=<address>&scopes=<ids>[&name=][&days=]][&deposit=<amount>][&balance=<amount>][&operator=fwss][&approval=unlimited]`
 *
 * `signer` is read as `authorize`, as the `fil` CLI names it. Older links to
 * `/console/session-keys?authorize=` and `/console?deposit=` are redirected
 * here by {@link legacySetupPath}.
 */
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
export type SetupLinkError = AuthorizeParamError | "bad-deposit" | "bad-balance" | "bad-operator" | "bad-approval";

export interface SessionKeyRequest {
  address: `0x${string}`;
  scopes: ScopeId[];
  /** Suggested key name; optional, so a missing or unusable one never refuses the link. The owner can edit it. */
  name: string | null;
  /** Suggested expiry in days; optional like `name`, and editable. */
  days: number | null;
}

export interface SetupRequest {
  /** The network the request is for; null only for a bare link, which sets up the wallet's own network. */
  network: Network | null;
  /** The session key to authorize; null when the link asks for none. */
  sessionKey: SessionKeyRequest | null;
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

  return {
    network,
    sessionKey,
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
