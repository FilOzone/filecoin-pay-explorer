/**
 * Validate the `?deposit=` / `?operator=` search params a CLI funding link
 * carries into `/console`, so the deposit-and-approve dialog opens filled in.
 * Both are untrusted URL input and never throw. The parameter names are a
 * contract shared with the CLIs: `/console?operator=fwss&network=<mainnet|calibration>[&deposit=<amount>]`.
 * Without `deposit` the link asks only for the operator approval.
 */

import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { parseNetworkParam } from "./authorizeParam";

/** Operators a link may name. Resolved to a per-network contract address by resolveOperator. */
export type OperatorSlug = "fwss";

/** A funding link with every field validated: the console prefills nothing from a partial one. */
export interface DepositLink {
  /** Decimal token amount as typed into the amount field, e.g. "2" or "1.5"; null when the link asks only for the approval. */
  amount: string | null;
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
 * null unless operator and network are usable, and so is the amount when the
 * link names one. A link is a request for one specific approval and, when it
 * says so, one specific deposit; an amount that cannot be read refuses the
 * whole link rather than approving with no deposit the link never asked for.
 */
export function parseDepositLink(params: URLSearchParams): DepositLink | null {
  const operator = parseOperatorParam(params.get("operator"));
  const network = parseNetworkParam(params.get("network"));
  if (!operator || !network) return null;
  if (!params.has("deposit")) return { amount: null, operator, network };
  const amount = parseDepositParam(params.get("deposit"));
  return amount ? { amount, operator, network } : null;
}
