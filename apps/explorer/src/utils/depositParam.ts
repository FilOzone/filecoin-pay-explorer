/**
 * Validate the `?deposit=` / `?operator=` search params a CLI funding link
 * carries into `/console`, so the deposit-and-approve dialog opens filled in.
 * Both are untrusted URL input and never throw. The parameter names are a
 * contract shared with filecoin-pin: `/console?deposit=<amount>&operator=fwss&network=<mainnet|calibration>`.
 */

import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { parseNetworkParam } from "./authorizeParam";

/** Operators a link may name. Resolved to a per-network contract address by resolveOperator. */
export type OperatorSlug = "fwss";

/** A funding link with every field validated: the console prefills nothing from a partial one. */
export interface DepositLink {
  /** Decimal token amount as typed into the amount field, e.g. "2" or "1.5". */
  amount: string;
  operator: OperatorSlug;
  network: Network;
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

/**
 * null unless amount, operator, and network are all usable. A link is a
 * request for one specific deposit and approval; filling in part of it
 * (say, unlimited allowances without an amount) would invite a mistake.
 */
export function parseDepositLink(params: URLSearchParams): DepositLink | null {
  const amount = parseDepositParam(params.get("deposit"));
  const operator = parseOperatorParam(params.get("operator"));
  const network = parseNetworkParam(params.get("network"));
  return amount && operator && network ? { amount, operator, network } : null;
}
