import type { Rail } from "@filecoin-pay/types";
import { toast } from "sonner";
import type { Hex } from "viem";
import { useRailSettlementAmounts } from "@/hooks/useRailSettlementAmounts";
import type { SettleRailParams } from "@/hooks/useRailSettlements";
import {
  getRailSettlementEligibility,
  getRailSettlementUnavailableReason,
  getSettlementUntilEpoch,
  getUnsettledEpochs,
} from "@/utils/railSettlement";

export type SettlementAmountState =
  | { status: "unavailable"; reason: string }
  | { status: "loading"; reason: string }
  | { status: "error"; reason: string }
  | { status: "ready"; amount: bigint; untilEpoch: bigint };

export type SettleRail = (params: SettleRailParams) => Promise<Hex | undefined>;

interface UseSettleRailDialogOptions {
  rail: Rail;
  userAddress: string;
  currentEpoch: bigint | undefined;
  open: boolean;
  isSettling: boolean;
  settleRail: SettleRail;
  onSettled: () => void;
}

export function useSettleRailDialog({
  rail,
  userAddress,
  currentEpoch,
  open,
  isSettling,
  settleRail,
  onSettled,
}: UseSettleRailDialogOptions) {
  const railId = BigInt(rail.railId);
  const settledUptoEpoch = BigInt(rail.settledUpto);
  const untilEpoch =
    currentEpoch !== undefined ? getSettlementUntilEpoch(BigInt(rail.endEpoch), currentEpoch) : undefined;
  const epochsSinceLastSettlement = getUnsettledEpochs(rail, untilEpoch);
  const settlementEligibility = getRailSettlementEligibility(rail, currentEpoch);
  const isSettlementAllowed = settlementEligibility.status === "allowed";

  const {
    data: settlementAmounts,
    isError,
    isFetching,
    isPending,
  } = useRailSettlementAmounts({
    railId,
    untilEpoch,
    enabled: open && isSettlementAllowed,
  });

  let settlementAmountState: SettlementAmountState;
  if (!isSettlementAllowed) {
    settlementAmountState = {
      status: "unavailable",
      reason: getRailSettlementUnavailableReason(settlementEligibility),
    };
  } else if (isSettling) {
    settlementAmountState = { status: "unavailable", reason: "A settlement is already in progress." };
  } else if (open && (isPending || isFetching)) {
    settlementAmountState = { status: "loading", reason: "The settlement amount is still being calculated." };
  } else if (isError) {
    settlementAmountState = {
      status: "error",
      reason: "Unable to calculate the settlement amount. Close the dialog and try again.",
    };
  } else if (settlementAmounts !== undefined) {
    settlementAmountState = {
      status: "ready",
      amount: settlementAmounts.totalSettledAmount,
      untilEpoch: settlementEligibility.untilEpoch,
    };
  } else {
    settlementAmountState = { status: "unavailable", reason: "The settlement amount is unavailable." };
  }

  const canSettle = isSettlementAllowed && !isSettling && settlementAmountState.status === "ready";
  const role: "payer" | "payee" = rail.payer.address.toLowerCase() === userAddress.toLowerCase() ? "payer" : "payee";

  const handleSettle = async () => {
    if (settlementAmountState.status !== "ready") {
      toast.error("Unable to settle", { description: settlementAmountState.reason });
      return;
    }

    try {
      await settleRail({
        railId,
        untilEpoch: settlementAmountState.untilEpoch,
        settlementAmount: settlementAmountState.amount,
        tokenSymbol: rail.token.symbol,
        tokenDecimals: Number(rail.token.decimals),
      });
      onSettled();
    } catch {
      // useRailSettlements reports transaction errors to the user.
    }
  };

  return {
    role,
    currentEpoch,
    untilEpoch,
    settledUptoEpoch,
    epochsSinceLastSettlement,
    settlementEligibility,
    settlementAmountState,
    canSettle,
    handleSettle,
  };
}
