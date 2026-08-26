/**
 * Validate the `?authorize=` / `?scopes=` search params used by the
 * filecoin-pin CLI pairing flow (`session create --console`). Both params are
 * untrusted URL input and never throw:
 * - `authorize` is either a real 20-byte EVM address — checksummed here so
 *   the UI only ever renders the canonical form — or it is dropped entirely.
 * - `scopes` is a comma-separated scope-id list; unknown entries are dropped,
 *   and when nothing valid remains the param collapses to null (full-menu default).
 */
import { getAddress, isAddress } from "viem";
// Explicit .ts extension keeps this import resolvable outside the Next bundler.
import { type ScopeId, SESSION_KEY_SCOPES } from "./sessionKeys.ts";

export function parseAuthorizeParam(value: string | null | undefined): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  // isAddress (strict by default) accepts all-lowercase hex or a correctly
  // checksummed address, and rejects everything else — including mixed-case
  // strings whose checksum doesn't verify.
  if (!isAddress(candidate)) return null;
  return getAddress(candidate);
}

/** Canonical-order, deduped scope ids from a `?scopes=` value, or null when none are valid. */
export function parseScopesParam(value: string | null | undefined): ScopeId[] | null {
  if (typeof value !== "string") return null;
  const requested = new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
  const ids = SESSION_KEY_SCOPES.filter((s) => requested.has(s.id.toLowerCase())).map((s) => s.id);
  return ids.length > 0 ? ids : null;
}

/**
 * How each scope checkbox opens in a request-initiated create dialog:
 * - "checked": requested, non-destructive — granted unless the user unchecks it.
 * - "requested-unchecked": requested AND destructive — the CLI asked for it,
 *   but destructive power needs an explicit opt-in click from the owner.
 * - "locked-off": not requested — reduce-only consent means the dialog never
 *   grants more than the request named; rendered disabled.
 */
export type RequestedScopePreset = "checked" | "requested-unchecked" | "locked-off";

export function presetScopeStates(requested: ScopeId[]): Record<ScopeId, RequestedScopePreset> {
  return Object.fromEntries(
    SESSION_KEY_SCOPES.map((scope) => {
      if (!requested.includes(scope.id)) return [scope.id, "locked-off"];
      return [scope.id, scope.destructive ? "requested-unchecked" : "checked"];
    }),
  ) as Record<ScopeId, RequestedScopePreset>;
}

/**
 * Validate the `?network=` pairing param: the network the CLI's failed
 * operation ran on. The page refuses to prefill when this names a network
 * other than the wallet's — without it, a calibration remediation link
 * approved by a mainnet-connected wallet silently grants scopes on mainnet.
 * Unknown values collapse to null (no network claim, wallet chain wins).
 */
export function parseNetworkParam(value: string | null | undefined): "mainnet" | "calibration" | null {
  if (typeof value !== "string") return null;
  const network = value.trim().toLowerCase();
  return network === "mainnet" || network === "calibration" ? network : null;
}
