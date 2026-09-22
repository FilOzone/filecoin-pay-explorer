import type { DataSet, Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { monthlyDataSetSpend } from "./monthlySpend";

type RailSet = Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail">;

const rail = (paymentRate: string, state: Rail["state"] = "ACTIVE", endEpoch: string = "0") =>
  ({ paymentRate, state, endEpoch }) as unknown as Rail;

describe("monthlyDataSetSpend", () => {
  it("converts wire-format string rates before summing", () => {
    const dataSet = { pdpRail: rail("10") } as RailSet;

    expect(monthlyDataSetSpend(dataSet, undefined)).toBe(10n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("adds the CDN rails once the payer has bought CDN", () => {
    const dataSet = {
      pdpRail: rail("10"),
      cacheMissRail: rail("2"),
      cdnRail: rail("3"),
    } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 100n)).toBe(15n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("counts a terminated rail's full month once its end epoch is further out than a month", () => {
    const dataSet = {
      pdpRail: rail("10", "TERMINATED", (100n + TIME_CONSTANTS.EPOCHS_PER_MONTH * 2n).toString()),
    } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 100n)).toBe(10n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("prorates a terminated rail by the epochs remaining before its end epoch", () => {
    const remainingEpochs = 500n;
    const dataSet = { pdpRail: rail("10", "TERMINATED", (100n + remainingEpochs).toString()) } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 100n)).toBe(10n * remainingEpochs);
  });

  it("drops a terminated rail's rate once the current epoch reaches its end epoch", () => {
    const dataSet = { pdpRail: rail("10", "TERMINATED", "200") } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 200n)).toBe(0n);
    expect(monthlyDataSetSpend(dataSet, 250n)).toBe(0n);
  });

  it("waits for the current epoch before estimating a terminated rail", () => {
    const dataSet = { pdpRail: rail("10", "TERMINATED", "200") } as RailSet;

    expect(monthlyDataSetSpend(dataSet, undefined)).toBeUndefined();
  });

  it("excludes a finalized rail's stale rate regardless of epoch", () => {
    const dataSet = { pdpRail: rail("10", "FINALIZED", "50") } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 10n)).toBe(0n);
  });

  it("treats a zero storage rate as zero spend with no CDN rails", () => {
    const dataSet = { pdpRail: rail("0") } as RailSet;

    expect(monthlyDataSetSpend(dataSet, 100n)).toBe(0n);
  });
});
