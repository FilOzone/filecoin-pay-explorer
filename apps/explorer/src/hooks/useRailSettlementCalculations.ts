import type { Rail } from "@filecoin-pay/types";
import { useMemo } from "react";
import { getUnsettledEpochs } from "@/utils/railSettlement";

interface RailSettlementCalculations {
  isPayer: boolean;
  currentEpoch: bigint;
  settledUptoEpoch: bigint;
  epochsSinceLastSettlement: bigint;
  expectedSettleAmount: bigint;
  isLoadingBlockNumber: boolean;
}

export const useRailSettlementCalculations = (
  rail: Rail,
  userAddress: string,
  currentEpoch: bigint | undefined,
): RailSettlementCalculations => {
  return useMemo(() => {
    const isPayer = rail.payer.address.toLowerCase() === userAddress.toLowerCase();
    const resolvedCurrentEpoch = currentEpoch ?? 0n;
    const settledUptoEpoch = BigInt(rail.settledUpto);
    const epochsSinceLastSettlement = getUnsettledEpochs(rail, currentEpoch);
    // expectedSettleAmount won't be accurate if the rail rate has changed since the last settlement
    const expectedSettleAmount = currentEpoch ? BigInt(rail.paymentRate) * epochsSinceLastSettlement : 0n;

    return {
      isPayer,
      currentEpoch: resolvedCurrentEpoch,
      settledUptoEpoch,
      epochsSinceLastSettlement,
      expectedSettleAmount,
      isLoadingBlockNumber: currentEpoch === undefined,
    };
  }, [rail, userAddress, currentEpoch]);
};
