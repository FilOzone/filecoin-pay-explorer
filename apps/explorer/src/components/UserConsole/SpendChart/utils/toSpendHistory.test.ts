import { describe, expect, it } from "vitest";
import type { AccountSpendHistoryResponse } from "@/hooks/useAccountDetails";
import { toSpendHistory } from "./toSpendHistory";

const OPERATOR = { address: "0x000000000000000000000000000000000000000A" };

const makeResponse = (overrides: Partial<AccountSpendHistoryResponse> = {}): AccountSpendHistoryResponse => ({
  _meta: { block: { number: 5_000 } },
  railRatePeriods: [],
  oneTimePayments: [],
  reachedPageLimit: false,
  ...overrides,
});

describe("toSpendHistory", () => {
  it("parses every numeric field to bigint", () => {
    const history = toSpendHistory(
      makeResponse({
        railRatePeriods: [{ id: "0x01", rate: "10", startEpoch: "100", untilEpoch: "200", operator: OPERATOR }],
        oneTimePayments: [{ id: "0x02", totalAmount: "55", createdAt: "1700000000", operator: OPERATOR }],
      }),
    );

    expect(history.periods[0]).toMatchObject({ rate: 10n, startEpoch: 100n, untilEpoch: 200n });
    expect(history.oneTimePayments[0]).toMatchObject({ amount: 55n, timestamp: 1_700_000_000n });
  });

  it("keeps an open period's untilEpoch as null", () => {
    // Only the accrual maths knows what epoch an open period should run to, so
    // the adapter must not substitute one.
    const history = toSpendHistory(
      makeResponse({
        railRatePeriods: [{ id: "0x01", rate: "10", startEpoch: "100", untilEpoch: null, operator: OPERATOR }],
      }),
    );

    expect(history.periods[0].untilEpoch).toBeNull();
  });

  it("lowercases operator addresses so grouping and name lookup agree", () => {
    const history = toSpendHistory(
      makeResponse({
        railRatePeriods: [{ id: "0x01", rate: "1", startEpoch: "0", untilEpoch: null, operator: OPERATOR }],
        oneTimePayments: [{ id: "0x02", totalAmount: "1", createdAt: "0", operator: OPERATOR }],
      }),
    );

    expect(history.periods[0].operatorAddress).toBe(OPERATOR.address.toLowerCase());
    expect(history.oneTimePayments[0].operatorAddress).toBe(OPERATOR.address.toLowerCase());
  });
});
