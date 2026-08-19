import type { Rail } from "@filecoin-pay/types";

type RailSettlementState = Pick<Rail, "rateChangeQueue" | "settledUpto" | "state" | "endEpoch">;

export type RailSettlementEligibility =
  | { status: "allowed"; untilEpoch: bigint }
  | { status: "finalized" }
  | { status: "current-epoch-unavailable" }
  | { status: "settled" }
  | { status: "paused-without-payments" };

/** Returns the epoch settlement should target, clamped to `endEpoch` once the rail has terminated. */
export function getSettlementUntilEpoch(endEpoch: bigint, currentEpoch: bigint): bigint {
  return endEpoch > 0n && endEpoch < currentEpoch ? endEpoch : currentEpoch;
}

/** Returns the number of epochs since the rail was last settled, up to `untilEpoch`. */
export function getUnsettledEpochs(rail: Pick<Rail, "settledUpto">, untilEpoch: bigint | undefined): bigint {
  if (untilEpoch === undefined) return 0n;

  const settledUpto = BigInt(rail.settledUpto);
  return untilEpoch > settledUpto ? untilEpoch - settledUpto : 0n;
}

/** Returns whether a rail can be settled and, if not, why. */
export function getRailSettlementEligibility(
  rail: RailSettlementState,
  currentEpoch: bigint | undefined,
): RailSettlementEligibility {
  if (rail.state === "FINALIZED") return { status: "finalized" };
  if (currentEpoch === undefined) return { status: "current-epoch-unavailable" };

  const untilEpoch = getSettlementUntilEpoch(BigInt(rail.endEpoch), currentEpoch);
  if (getUnsettledEpochs(rail, untilEpoch) === 0n) return { status: "settled" };
  if (rail.state !== "ZERORATE") return { status: "allowed", untilEpoch };

  const settledUpto = BigInt(rail.settledUpto);
  const hasUnsettledPayments = rail.rateChangeQueue.some(
    (rateChange) => BigInt(rateChange.rate) > 0n && BigInt(rateChange.untilEpoch) > settledUpto,
  );

  return hasUnsettledPayments ? { status: "allowed", untilEpoch } : { status: "paused-without-payments" };
}

export function getRailSettlementUnavailableReason(eligibility: RailSettlementEligibility): string {
  switch (eligibility.status) {
    case "finalized":
      return "Rail is finalized and cannot be settled.";
    case "current-epoch-unavailable":
      return "Failed to fetch the current epoch. Please try again.";
    case "settled":
      return "Rail has no unsettled payments.";
    case "paused-without-payments":
      return "Paused rail has no unsettled payments.";
    case "allowed":
      return "";
  }
}
