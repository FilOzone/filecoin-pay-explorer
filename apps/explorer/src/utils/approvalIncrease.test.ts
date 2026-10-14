import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { type ApprovalIncreaseInput, type ApprovalTotals, computeIncreasedApproval } from "./approvalIncrease";

const current = { lockup: 100n, rate: 10n, maxLockupPeriod: 50n };
const unlimited = { lockup: maxUint256, rate: maxUint256, maxLockupPeriod: maxUint256 };
const empty: ApprovalIncreaseInput = { lockup: "", rate: "", maxLockupPeriod: "", isUnlimited: false };
const compute = (input: Partial<ApprovalIncreaseInput>, totals: ApprovalTotals = current) =>
  computeIncreasedApproval({ ...empty, ...input }, totals, 18);

describe("computeIncreasedApproval", () => {
  it("adds parsed increases to the current totals", () => {
    expect(compute({ lockup: "1.5", rate: "2", maxLockupPeriod: "7" })).toEqual({
      status: "ready",
      totals: {
        lockup: 100n + 1_500_000_000_000_000_000n,
        rate: 10n + 2_000_000_000_000_000_000n,
        maxLockupPeriod: 57n,
      },
    });
  });

  it("accepts an increase to the lockup period alone", () => {
    expect(compute({ maxLockupPeriod: "5" })).toEqual({
      status: "ready",
      totals: { ...current, maxLockupPeriod: 55n },
    });
  });

  it.each([
    ["empty fields", {}],
    ["all zeros", { lockup: "0", rate: "0", maxLockupPeriod: "0" }],
  ])("reports %s as unchanged", (_name, input) => {
    expect(compute(input)).toEqual({ status: "unchanged" });
  });

  it("sets every total to uint256 when unlimited, regardless of the typed values", () => {
    expect(compute({ isUnlimited: true, lockup: "1e5", maxLockupPeriod: "1.5" })).toEqual({
      status: "ready",
      totals: unlimited,
    });
  });

  it("reports unlimited as unchanged only when every total is already uint256", () => {
    expect(compute({ isUnlimited: true }, unlimited)).toEqual({ status: "unchanged" });
    expect(compute({ isUnlimited: true }, { ...unlimited, maxLockupPeriod: 2n ** 64n - 1n })).toEqual({
      status: "ready",
      totals: unlimited,
    });
  });

  it.each([
    ["exponent lockup", { lockup: "1e5" }],
    ["exponent rate", { rate: "1e5" }],
    ["negative lockup", { lockup: "-1" }],
    ["decimal period", { maxLockupPeriod: "1.5" }],
    ["exponent period", { maxLockupPeriod: "1e5" }],
    ["negative period", { maxLockupPeriod: "-1" }],
  ])("rejects %s", (_name, input) => {
    expect(compute(input)).toEqual({ status: "invalid" });
  });

  it.each([
    ["lockup", { totals: { lockup: maxUint256 }, input: { lockup: "0.000000000000000001" } }],
    ["rate", { totals: { rate: maxUint256 }, input: { rate: "0.000000000000000001" } }],
    ["period", { totals: { maxLockupPeriod: maxUint256 }, input: { maxLockupPeriod: "1" } }],
  ])("rejects a %s total above uint256", (_name, { totals, input }) => {
    expect(compute(input, { ...current, ...totals })).toEqual({ status: "invalid" });
  });

  it("accepts a total of exactly uint256", () => {
    expect(compute({ maxLockupPeriod: "1" }, { ...current, maxLockupPeriod: maxUint256 - 1n })).toEqual({
      status: "ready",
      totals: { ...current, maxLockupPeriod: maxUint256 },
    });
  });
});
