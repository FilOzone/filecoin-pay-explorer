import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { buildServiceMetricsRows } from "./buildServiceMetricsRows";

type RowsInput = Parameters<typeof buildServiceMetricsRows>[0];

const MONTH = TIME_CONSTANTS.EPOCHS_PER_MONTH;
const DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;
const NOW = 1_700_000_000n;
const USDFC = { id: "0xusdfc" as const, symbol: "USDFC", decimals: 18n };
const AXL_USDC = { id: "0xaxl" as const, symbol: "axlUSDC", decimals: 6n };

const userToken = (token: { id: `0x${string}` }, funds = 0n, lockupRate = 0n, lastSettledTimestamp = NOW) => ({
  funds,
  lockupCurrent: 0n,
  lockupRate,
  lockupLastSettledUntilEpoch: 1n,
  lockupLastSettledUntilTimestamp: lastSettledTimestamp,
  token,
});

const input = (overrides: Partial<RowsInput> = {}): RowsInput => ({
  account: {
    operatorApprovals: [{ lockupUsage: 0n, token: USDFC }],
    userTokens: [userToken(USDFC)],
  },
  rails: [],
  oneTimePayments: [],
  tokenIdsWithRails: undefined,
  ...overrides,
});

const twoApprovedTokens = {
  operatorApprovals: [
    { lockupUsage: 9n, token: USDFC },
    { lockupUsage: 7n, token: AXL_USDC },
  ],
  userTokens: [userToken(USDFC), userToken(AXL_USDC)],
};

const rail = (paymentRate: bigint, lockupPeriod: bigint = 30n * DAY, token: { id: `0x${string}` } = USDFC) => ({
  paymentRate,
  lockupPeriod,
  token,
});

const buildOne = (overrides: Partial<RowsInput>) => {
  const [row] = buildServiceMetricsRows(input(overrides), NOW);
  return row;
};

describe("buildServiceMetricsRows", () => {
  it("keeps each token's amounts on its own row, sorted by symbol", () => {
    const rows = buildServiceMetricsRows(
      input({
        account: twoApprovedTokens,
        rails: [rail(10n), rail(20n), rail(5n, 30n * DAY, AXL_USDC)],
        oneTimePayments: [
          { totalAmount: 1n, token: USDFC },
          { totalAmount: 2n, token: USDFC },
          { totalAmount: 4n, token: AXL_USDC },
        ],
      }),
      NOW,
    );

    const notice = "Pays the 30-day notice after you terminate";
    expect(rows).toEqual([
      {
        token: AXL_USDC,
        recurringPerMonth: 5n * MONTH,
        oneTimeThisMonth: 4n,
        lockedDeposit: 7n,
        noticeCopy: notice,
        accountRunwayText: "No recurring charges",
      },
      {
        token: USDFC,
        recurringPerMonth: 30n * MONTH,
        oneTimeThisMonth: 3n,
        lockedDeposit: 9n,
        noticeCopy: notice,
        accountRunwayText: "No recurring charges",
      },
    ]);
  });

  it("shows a deposit with no recurring spend or notice when no rail is paying", () => {
    expect(buildOne({ account: { operatorApprovals: [{ lockupUsage: 7n, token: USDFC }], userTokens: [] } })).toEqual({
      token: USDFC,
      recurringPerMonth: 0n,
      oneTimeThisMonth: 0n,
      lockedDeposit: 7n,
      noticeCopy: null,
      accountRunwayText: "—",
    });
  });

  it("returns no rows for an account that was never indexed", () => {
    expect(buildServiceMetricsRows(input({ account: null }), NOW)).toEqual([]);
  });

  describe("which tokens get a row", () => {
    const symbols = (tokenIdsWithRails: string[] | undefined) =>
      buildServiceMetricsRows(input({ account: twoApprovedTokens, tokenIdsWithRails }), NOW).map(
        (row) => row.token.symbol,
      );

    it("leaves out an approved token the pair has no rail in", () => {
      expect(symbols([AXL_USDC.id])).toEqual(["axlUSDC"]);
    });

    it("keeps every approved token until the check has answered", () => {
      expect(symbols(undefined)).toEqual(["axlUSDC", "USDFC"]);
    });
  });

  it.each(["loading", "unavailable"] as const)("carries %s one-time payments beside the other figures", (reason) => {
    const row = buildOne({
      account: { operatorApprovals: [{ lockupUsage: 7n, token: USDFC }], userTokens: [] },
      oneTimePayments: reason,
    });

    expect(row).toMatchObject({ oneTimeThisMonth: reason, lockedDeposit: 7n });
  });

  describe("notice copy", () => {
    it.each([
      ["a shared whole-day period", [rail(1n), rail(2n)], "Pays the 30-day notice after you terminate"],
      ["a different whole-day period", [rail(1n, 7n * DAY)], "Pays the 7-day notice after you terminate"],
      ["mixed periods", [rail(1n), rail(1n, 7n * DAY)], "Pays the notice period after you terminate"],
      ["a period that isn't whole days", [rail(1n, DAY + 1n)], "Pays the notice period after you terminate"],
      ["only rails without a lockup", [rail(1n, 0n)], null],
    ])("handles %s", (_, rails, noticeCopy) => {
      expect(buildOne({ rails })?.noticeCopy).toBe(noticeCopy);
    });

    it("ignores rails without a lockup when another rail has a notice", () => {
      expect(buildOne({ rails: [rail(1n), rail(1n, 0n)] })?.noticeCopy).toBe(
        "Pays the 30-day notice after you terminate",
      );
    });
  });

  describe("account runway", () => {
    const withToken = (token: ReturnType<typeof userToken>) =>
      buildOne({ account: { operatorApprovals: [{ lockupUsage: 0n, token: USDFC }], userTokens: [token] } });

    it("gives the date and the days left", () => {
      // 12.5 days at 10 per epoch.
      expect(withToken(userToken(USDFC, 360_000n, 10n))?.accountRunwayText).toMatch(/^\w+ \d+(, \d+)? \(in 12 days\)$/);
    });

    it("says funding expired once the account has run out", () => {
      expect(withToken(userToken(USDFC, 100n, 100n, NOW - 86_400n))?.accountRunwayText).toBe("Funding expired");
    });

    it("reads the runway of the row's own token", () => {
      const row = buildOne({
        account: {
          operatorApprovals: [{ lockupUsage: 0n, token: USDFC }],
          userTokens: [userToken(AXL_USDC, 100n, 100n, NOW - 86_400n), userToken(USDFC)],
        },
      });

      expect(row?.accountRunwayText).toBe("No recurring charges");
    });
  });
});
