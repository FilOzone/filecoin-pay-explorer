import type { DataSet, Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";

type SpendRail = Pick<Rail, "paymentRate" | "state" | "endEpoch">;

// A terminated rail keeps charging until its end epoch.
function chargingEpochsInMonth(rail: SpendRail, currentEpoch: bigint | undefined): bigint | undefined {
  if (rail.state === "FINALIZED") return 0n;
  if (rail.state !== "TERMINATED") return TIME_CONSTANTS.EPOCHS_PER_MONTH;
  if (currentEpoch === undefined) return undefined;

  const remaining = BigInt(rail.endEpoch) - currentEpoch;
  if (remaining <= 0n) return 0n;
  return remaining < TIME_CONSTANTS.EPOCHS_PER_MONTH ? remaining : TIME_CONSTANTS.EPOCHS_PER_MONTH;
}

function monthlyRailSpend(rail: SpendRail | null | undefined, currentEpoch: bigint | undefined): bigint | undefined {
  if (!rail) return 0n;
  const chargingEpochs = chargingEpochsInMonth(rail, currentEpoch);
  if (chargingEpochs === undefined) return undefined;
  // GraphQL BigInt values arrive as decimal strings.
  return BigInt(rail.paymentRate) * chargingEpochs;
}

export function monthlyDataSetSpend(
  dataSet: Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail">,
  currentEpoch: bigint | undefined,
): bigint | undefined {
  const pdpSpend = monthlyRailSpend(dataSet.pdpRail, currentEpoch);
  const cacheMissSpend = monthlyRailSpend(dataSet.cacheMissRail, currentEpoch);
  const cdnSpend = monthlyRailSpend(dataSet.cdnRail, currentEpoch);

  if (pdpSpend === undefined || cacheMissSpend === undefined || cdnSpend === undefined) return undefined;
  return pdpSpend + cacheMissSpend + cdnSpend;
}
