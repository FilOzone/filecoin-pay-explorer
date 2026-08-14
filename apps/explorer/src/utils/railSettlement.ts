import type { Rail } from "@filecoin-pay/types";

type RailSettlementState = Pick<Rail, "rateChangeQueue" | "settledUpto" | "state">;

/** Returns the number of epochs since the rail was last settled. */
export function getUnsettledEpochs(rail: Pick<Rail, "settledUpto">, currentEpoch: bigint | undefined): bigint {
  if (currentEpoch === undefined) return 0n;

  const settledUpto = BigInt(rail.settledUpto);
  return currentEpoch > settledUpto ? currentEpoch - settledUpto : 0n;
}

/** Checks whether the rail's current state allows a settlement. */
export function isRailSettlementAllowed(rail: RailSettlementState, currentEpoch: bigint | undefined): boolean {
  if (rail.state === "FINALIZED") return false;
  if (getUnsettledEpochs(rail, currentEpoch) === 0n) return false;
  if (rail.state !== "ZERORATE") return true;

  const latestRateChange = rail.rateChangeQueue[0];
  if (latestRateChange === undefined) return false;

  return BigInt(latestRateChange.rate) > 0n && BigInt(latestRateChange.untilEpoch) > BigInt(rail.settledUpto);
}
