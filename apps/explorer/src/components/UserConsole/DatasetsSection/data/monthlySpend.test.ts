import type { DataSet } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { monthlyDataSetSpend } from "./monthlySpend";

type RailRate = Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail">;

const railWithRate = (paymentRate: bigint) => ({ paymentRate }) as DataSet["pdpRail"];

describe("monthlyDataSetSpend", () => {
  it("scales a storage-only dataset's rate to a month", () => {
    const dataSet = { pdpRail: railWithRate(10n) } as RailRate;

    expect(monthlyDataSetSpend(dataSet)).toBe(10n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("adds the CDN rails once the payer has bought CDN", () => {
    const dataSet = {
      pdpRail: railWithRate(10n),
      cacheMissRail: railWithRate(2n),
      cdnRail: railWithRate(3n),
    } as RailRate;

    expect(monthlyDataSetSpend(dataSet)).toBe(15n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("treats a zero storage rate as zero spend with no CDN rails", () => {
    const dataSet = { pdpRail: railWithRate(0n) } as RailRate;

    expect(monthlyDataSetSpend(dataSet)).toBe(0n);
  });
});
