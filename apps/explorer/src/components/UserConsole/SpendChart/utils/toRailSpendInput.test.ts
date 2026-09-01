import { describe, expect, it } from "vitest";
import type { AccountSpendHistoryResponse } from "@/hooks/useAccountDetails";
import { SPEND_HISTORY_NESTED_LIMIT, SPEND_HISTORY_RAIL_LIMIT } from "@/hooks/useAccountDetails";
import { EPOCH_DURATION } from "@/utils/constants";
import { hasReachedSpendHistoryLimit, toRailSpendInput } from "./toRailSpendInput";

const GENESIS = 1_000n;

const response: AccountSpendHistoryResponse = {
  _meta: { block: { number: 2_000 } },
  rails: [
    {
      paymentRate: "100",
      endEpoch: "0",
      createdAt: String(1_000 + 30 * EPOCH_DURATION),
      rateChangeQueue: [{ startEpoch: "10", untilEpoch: "20", rate: "50" }],
      oneTimePayments: [{ totalAmount: "999", createdAt: "1234" }],
    },
  ],
};

describe("toRailSpendInput", () => {
  it("coerces every numeric field out of its string representation", () => {
    const [rail] = toRailSpendInput(response, GENESIS);

    expect(rail.paymentRate).toBe(100n);
    expect(rail.endEpoch).toBe(0n);
    expect(rail.segments).toEqual([{ startEpoch: 10n, untilEpoch: 20n, rate: 50n }]);
    expect(rail.oneTimePayments).toEqual([{ amount: 999n, timestamp: 1_234n }]);
  });

  it("derives the creation epoch from the unix timestamp via genesis", () => {
    const [rail] = toRailSpendInput(response, GENESIS);

    expect(rail.createdAtEpoch).toBe(30n);
  });

  it("returns an empty list for an account with no rails", () => {
    expect(toRailSpendInput({ _meta: null, rails: [] }, GENESIS)).toEqual([]);
  });
});

describe("hasReachedSpendHistoryLimit", () => {
  const rail = response.rails[0];

  it("reports a response below every cap as complete", () => {
    expect(hasReachedSpendHistoryLimit(response)).toBe(false);
  });

  it("flags a rail list filled to its cap", () => {
    const rails = Array.from({ length: SPEND_HISTORY_RAIL_LIMIT }, () => rail);
    expect(hasReachedSpendHistoryLimit({ _meta: null, rails })).toBe(true);
  });

  it("flags a rate history filled to its cap", () => {
    const segment = rail.rateChangeQueue[0];
    const rateChangeQueue = Array.from({ length: SPEND_HISTORY_NESTED_LIMIT }, () => segment);
    expect(hasReachedSpendHistoryLimit({ _meta: null, rails: [{ ...rail, rateChangeQueue }] })).toBe(true);
  });

  it("flags one-time payments filled to their cap", () => {
    const payment = rail.oneTimePayments[0];
    const oneTimePayments = Array.from({ length: SPEND_HISTORY_NESTED_LIMIT }, () => payment);
    expect(hasReachedSpendHistoryLimit({ _meta: null, rails: [{ ...rail, oneTimePayments }] })).toBe(true);
  });

  it("reports an empty response as complete", () => {
    expect(hasReachedSpendHistoryLimit({ _meta: null, rails: [] })).toBe(false);
  });
});
