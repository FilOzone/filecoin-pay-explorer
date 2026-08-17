/**
 * Validate the `?authorize=` search param used by the filecoin-pin CLI
 * pairing flow (`session create --console`). The param is untrusted URL
 * input: it is either a real 20-byte EVM address — checksummed here so the
 * UI only ever renders the canonical form — or it is dropped entirely.
 * Never throws; hostile values (script tags, ENS names, truncated hex)
 * all collapse to null.
 */
import { getAddress, isAddress } from "viem";

export function parseAuthorizeParam(value: string | null | undefined): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  // isAddress (strict by default) accepts all-lowercase hex or a correctly
  // checksummed address, and rejects everything else — including mixed-case
  // strings whose checksum doesn't verify.
  if (!isAddress(candidate)) return null;
  return getAddress(candidate);
}
