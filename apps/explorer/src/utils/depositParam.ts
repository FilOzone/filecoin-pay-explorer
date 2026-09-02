/**
 * Validate the `?deposit=` / `?operator=` search params a CLI funding link
 * carries into `/console`, so the deposit-and-approve dialog opens filled in.
 * Both are untrusted URL input and never throw. The parameter names are a
 * contract shared with filecoin-pin: `/console?deposit=<amount>&operator=fwss`.
 */

import { getChain } from "@/constants/chains";
import type { Network } from "@/types";

/** Operators a link may name. Resolved to a per-network contract address by resolveOperator. */
export type OperatorSlug = "fwss";

export interface DepositPrefill {
  /** Decimal token amount as typed into the amount field, e.g. "2" or "1.5". */
  amount: string | null;
  operator: OperatorSlug | null;
}

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

/** null when the link carries neither a usable amount nor a known operator. */
export function parseDepositPrefill(params: URLSearchParams): DepositPrefill | null {
  const amount = parseDepositParam(params.get("deposit"));
  const operator = parseOperatorParam(params.get("operator"));
  return amount === null && operator === null ? null : { amount, operator };
}
