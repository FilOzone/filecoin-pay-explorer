import type { DataSet, Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { epochsApplicable } from "../../SpendChart/utils/accrueSpend";

type SpendRail = Pick<Rail, "paymentRate" | "state" | "endEpoch">;

// A terminated rail keeps charging until its end epoch.
function chargingEpochsInMonth(rail: SpendRail, currentEpoch: bigint | undefined): bigint | undefined {
  if (rail.state === "FINALIZED") return 0n;
  if (rail.state !== "TERMINATED") return TIME_CONSTANTS.EPOCHS_PER_MONTH;
  if (currentEpoch === undefined) return undefined;
  return epochsApplicable(
    currentEpoch,
    BigInt(rail.endEpoch),
    currentEpoch,
    currentEpoch + TIME_CONSTANTS.EPOCHS_PER_MONTH,
  );
}

// Only the storage (PDP) rail carries a rate; FWSS settles the CDN rails by usage.
export function monthlyDataSetSpend(
  { pdpRail }: Pick<DataSet, "pdpRail">,
  currentEpoch: bigint | undefined,
): bigint | undefined {
  const chargingEpochs = chargingEpochsInMonth(pdpRail, currentEpoch);
  if (chargingEpochs === undefined) return undefined;
  // GraphQL BigInt values arrive as decimal strings.
  return BigInt(pdpRail.paymentRate) * chargingEpochs;
}
