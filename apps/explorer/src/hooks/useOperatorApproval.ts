import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";

/** An account's approval of an operator for one token, as the Payments contract holds it now. */
export type OperatorApprovalState = {
  isApproved: boolean;
  rateAllowance: bigint;
  lockupAllowance: bigint;
  rateUsage: bigint;
  lockupUsage: bigint;
  maxLockupPeriod: bigint;
};

/** The approval from the chain, not the subgraph: `setOperatorApproval` takes absolute values, and indexing lags. */
export const useOperatorApproval = (network: Network, token: Address, owner: Address, operator: Address) => {
  const chain = getChain(network);
  return useReadContract({
    address: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    functionName: "operatorApprovals",
    args: [token, owner, operator],
    query: {
      select: ([isApproved, rateAllowance, lockupAllowance, rateUsage, lockupUsage, maxLockupPeriod]) =>
        ({
          isApproved,
          rateAllowance,
          lockupAllowance,
          rateUsage,
          lockupUsage,
          maxLockupPeriod,
        }) satisfies OperatorApprovalState,
    },
  });
};
