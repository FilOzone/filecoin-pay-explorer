import type { Address, PublicClient } from "viem";
import { getDelegationState, readPaymasterFees } from "./circle-paymaster";

/**
 * USDC held out of a USDC-gas deposit for Base gas and the bridge-fee swap; what is not used stays in the wallet.
 * ponytail: provisional until staging measures real Base to Filecoin routes, with and without the FIL top-up.
 */
export const FEE_RESERVE_USDC = 500_000n;

/** `conflict`: the account delegates to a contract the console did not install, and it never replaces one. */
export type PaymasterDepositPlan = "ready" | "conflict";

/** Where the form's USDC-gas check stands; the review blocker reads it in place of the native balance. */
export type UsdcGasStatus = PaymasterDepositPlan | "planning" | "failed" | "insufficient";

export function getUsdcGasStatus(
  budget: bigint | null,
  plan: PaymasterDepositPlan | undefined,
  failed: boolean,
): UsdcGasStatus {
  if (budget !== null && budget <= FEE_RESERVE_USDC) return "insufficient";
  if (failed) return "failed";
  return plan ?? "planning";
}

/** Checks the payer can pay gas in USDC: no foreign delegation, and Circle's surcharge within its cap. */
export async function planPaymasterDeposit(
  client: Pick<PublicClient, "getCode" | "multicall">,
  owner: Address,
): Promise<PaymasterDepositPlan> {
  const [code] = await Promise.all([client.getCode({ address: owner }), readPaymasterFees(client)]);
  return getDelegationState(code) === "conflict" ? "conflict" : "ready";
}
