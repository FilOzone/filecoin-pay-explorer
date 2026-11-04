import type { Address, PublicClient } from "viem";
import { getDelegationState, readPaymasterFees } from "./circle-paymaster";

/**
 * USDC held on top of a USDC-gas deposit for Base gas and the bridge-fee swap; what is not used stays in the wallet.
 * ponytail: provisional until staging measures real Base to Filecoin routes, with and without the FIL top-up.
 */
export const FEE_RESERVE_USDC = 500_000n;

/** `conflict`: the account delegates to a contract the console did not install, and it never replaces one. */
export type UsdcGasPayer = "ready" | "conflict";

/** Checks the payer can pay gas in USDC: no foreign delegation, and Circle's surcharge within its cap. */
export async function checkUsdcGasPayer(
  client: Pick<PublicClient, "getCode" | "multicall">,
  owner: Address,
): Promise<UsdcGasPayer> {
  const [code] = await Promise.all([client.getCode({ address: owner }), readPaymasterFees(client)]);
  return getDelegationState(code) === "conflict" ? "conflict" : "ready";
}
