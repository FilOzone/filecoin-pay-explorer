import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { FEE_RESERVE_USDC, getUsdcGasStatus, planPaymasterDeposit } from "./paymaster-deposit-plan";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const OUR_DELEGATION: Hex = "0xef0100e6cae83bde06e4c305530e199d7217f42808555b";
const OTHER_DELEGATION: Hex = "0xef01001111111111111111111111111111111111111111";

const client = ({ code, feeSpread = 0 }: { code?: Hex; feeSpread?: number } = {}) =>
  ({
    getCode: vi.fn(async () => code),
    multicall: vi.fn(async () => [35_000, feeSpread, 2_500_000_000n]),
  }) as unknown as Parameters<typeof planPaymasterDeposit>[0];

describe("planPaymasterDeposit", () => {
  it.each([
    ["an undelegated account", undefined],
    ["an account already delegated to ours", OUR_DELEGATION],
  ])("accepts %s", async (_label, code) => {
    await expect(planPaymasterDeposit(client({ code }), PAYER)).resolves.toEqual({ kind: "ready" });
  });

  it("refuses an account delegated to another contract", async () => {
    await expect(planPaymasterDeposit(client({ code: OTHER_DELEGATION }), PAYER)).resolves.toEqual({
      kind: "conflicting-delegation",
    });
  });

  it("fails while Circle's surcharge is above its cap", async () => {
    await expect(planPaymasterDeposit(client({ feeSpread: 1_001 }), PAYER)).rejects.toThrow(
      "surcharge is above 10%. Try again later.",
    );
  });
});

describe("getUsdcGasStatus", () => {
  const ready = { kind: "ready" } as const;

  it.each([
    ["an amount at the reserve", FEE_RESERVE_USDC, ready, false, { status: "insufficient" }],
    ["an amount above the reserve", FEE_RESERVE_USDC + 1n, ready, false, { status: "ready" }],
    ["a failed check", 10_000_000n, undefined, true, { status: "failed" }],
    ["a check in flight", 10_000_000n, undefined, false, { status: "planning" }],
    ["a foreign delegation", 10_000_000n, { kind: "conflicting-delegation" } as const, false, { status: "conflict" }],
  ] as const)("reports %s", (_label, budget, plan, failed, expected) => {
    expect(getUsdcGasStatus(budget, plan, failed)).toEqual(expected);
  });
});
