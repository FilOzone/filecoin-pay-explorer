import { useCallback, useState } from "react";
import { formatToken } from "@/utils/formatter";
import { type UseContractTransactionOptions, useContractTransaction } from "./useContractTransaction";

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
export const useRailSettlements = (options: UseContractTransactionOptions & { chainId: number }) => {
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
    return execute({
      functionName: "settleRail",
      args: [railId, untilEpoch],
      metadata: {
        type: "settleRail",
        railId: id,
        amount: formatToken(settlementAmount, tokenDecimals),
        token: tokenSymbol,
      },
      onError: settled,
      onConfirmed: settled,
      onReverted: settled,
    });
  };

  const isSettling = useCallback((railId: string) => settlingRails.has(railId), [settlingRails]);

  return { settleRail, isSettling };
};
