/**
 * Validate the `?deposit=` / `?operator=` search params a CLI setup link
 * carries, read by `parseSetupLink`. Both are untrusted URL input and never throw.
 */

import { getChain } from "@/constants/chains";
import type { Network } from "@/types";

/** Operators a link may name. Resolved to a per-network contract address by resolveOperator. */
export type OperatorSlug = "fwss";

// Plain decimal only: no sign, exponent, hex, or leading zeros; at most 18 fraction digits (USDFC decimals).
const AMOUNT = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;

export function parseDepositParam(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!AMOUNT.test(candidate)) return null;
  return Number(candidate) > 0 ? candidate : null;
}

export function parseOperatorParam(value: string | null | undefined): OperatorSlug | null {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase() === "fwss" ? "fwss" : null;
}

/** The operator contract address a slug names on the given network. */
export function resolveOperator(slug: OperatorSlug, network: Network): `0x${string}` {
  return getChain(network).contracts[slug].address;
}
