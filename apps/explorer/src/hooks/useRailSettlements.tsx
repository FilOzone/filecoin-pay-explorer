import { useCallback, useState } from "react";
import type { Abi, Address } from "viem";
import { formatToken } from "@/utils/formatter";
import { useContractTransaction } from "./useContractTransaction";

interface UseRailSettlementsOptions {
  account?: Address;
  contractAddress: Address;
  abi: Abi;
  chainId: number;
  /** Named in the error toast when the wallet is on another network. */
  chainName?: string;
  explorerUrl?: string;
}

export interface SettleRailParams {
  railId: bigint;
  untilEpoch: bigint;
  settlementAmount: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
}

/**
 * Settles rails through the shared transaction lifecycle, which tracks each
 * submission to its own receipt, and adds which rails are settling: from the
 * wallet prompt until that rail's receipt confirms or fails.
 */
export const useRailSettlements = (options: UseRailSettlementsOptions) => {
  const [settlingRails, setSettlingRails] = useState<ReadonlySet<string>>(new Set());
  const { execute } = useContractTransaction(options);

  const settleRail = async ({ railId, untilEpoch, settlementAmount, tokenSymbol, tokenDecimals }: SettleRailParams) => {
    const id = railId.toString();
    const settled = () =>
      setSettlingRails((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });

    setSettlingRails((current) => new Set(current).add(id));
    try {
      return await execute({
        functionName: "settleRail",
        args: [railId, untilEpoch],
        metadata: {
          type: "settleRail",
          railId: id,
          amount: formatToken(settlementAmount, tokenDecimals),
          token: tokenSymbol,
        },
        onConfirmed: settled,
        onReverted: settled,
      });
    } catch (error) {
      settled();
      throw error;
    }
  };

  const isSettling = useCallback((railId: string) => settlingRails.has(railId), [settlingRails]);

  return { settleRail, isSettling };
};
