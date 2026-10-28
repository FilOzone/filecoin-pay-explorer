import type { Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { monthlyDataSetSpend } from "./monthlySpend";

const dataSet = (paymentRate: string, state: Rail["state"] = "ACTIVE", endEpoch: string = "0") => ({
  pdpRail: { paymentRate, state, endEpoch } as unknown as Rail,
});

describe("monthlyDataSetSpend", () => {
  it("converts wire-format string rates", () => {
    expect(monthlyDataSetSpend(dataSet("10"), undefined)).toBe(10n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("counts a terminated rail's full month once its end epoch is further out than a month", () => {
    const terminated = dataSet("10", "TERMINATED", (100n + TIME_CONSTANTS.EPOCHS_PER_MONTH * 2n).toString());

    expect(monthlyDataSetSpend(terminated, 100n)).toBe(10n * TIME_CONSTANTS.EPOCHS_PER_MONTH);
  });

  it("prorates a terminated rail by the epochs remaining before its end epoch", () => {
    const remainingEpochs = 500n;
    const terminated = dataSet("10", "TERMINATED", (100n + remainingEpochs).toString());

    expect(monthlyDataSetSpend(terminated, 100n)).toBe(10n * remainingEpochs);
  });

  it("drops a terminated rail's rate once the current epoch reaches its end epoch", () => {
    const terminated = dataSet("10", "TERMINATED", "200");

    expect(monthlyDataSetSpend(terminated, 200n)).toBe(0n);
    expect(monthlyDataSetSpend(terminated, 250n)).toBe(0n);
  });

  it("waits for the current epoch before estimating a terminated rail", () => {
    expect(monthlyDataSetSpend(dataSet("10", "TERMINATED", "200"), undefined)).toBeUndefined();
  });

  it("excludes a finalized rail's stale rate regardless of epoch", () => {
    expect(monthlyDataSetSpend(dataSet("10", "FINALIZED", "50"), 10n)).toBe(0n);
  });
});
