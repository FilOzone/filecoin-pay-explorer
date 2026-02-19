import type { Rail } from "@filecoin-pay/types";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";

interface RailSettlementCalculations {
  isPayer: boolean;
  currentEpoch: bigint;
  settledUptoEpoch: bigint;
  epochsSinceLastSettlement: bigint;
  expectedSettleAmount: bigint;
  isLoadingBlockNumber: boolean;
}

export const useRailSettlementCalculations = (rail: Rail, userAddress: string): RailSettlementCalculations => {
  const { data: blockNumber, isLoading: isLoadingBlockNumber } = useBlockNumber({ watch: true });

  return useMemo(() => {
    const isPayer = rail.payer.address.toLowerCase() === userAddress.toLowerCase();
    const currentEpoch = blockNumber ? BigInt(blockNumber) : 0n;
    const settledUptoEpoch = BigInt(rail.settledUpto);
    const epochsSinceLastSettlement = currentEpoch > settledUptoEpoch ? currentEpoch - settledUptoEpoch : 0n;
    const expectedSettleAmount = blockNumber ? BigInt(rail.paymentRate) * epochsSinceLastSettlement : 0n;

    return {
      isPayer,
      currentEpoch,
      settledUptoEpoch,
      epochsSinceLastSettlement,
      expectedSettleAmount,
      isLoadingBlockNumber,
    };
  }, [rail, userAddress, blockNumber, isLoadingBlockNumber]);
};
