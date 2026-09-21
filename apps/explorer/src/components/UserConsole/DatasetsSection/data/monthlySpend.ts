import type { DataSet } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";

/**
 * A dataset's total monthly cost to the payer: the sum of every rail funding
 * it. `cacheMissRail` and `cdnRail` only exist once the payer has bought CDN.
 */
export function monthlyDataSetSpend(dataSet: Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail">): bigint {
  const ratePerEpoch =
    dataSet.pdpRail.paymentRate + (dataSet.cacheMissRail?.paymentRate ?? 0n) + (dataSet.cdnRail?.paymentRate ?? 0n);

  return ratePerEpoch * TIME_CONSTANTS.EPOCHS_PER_MONTH;
}
