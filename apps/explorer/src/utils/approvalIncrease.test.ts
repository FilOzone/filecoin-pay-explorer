import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { type ApprovalIncreaseInput, computeIncreasedApproval } from "./approvalIncrease";

const current = { lockup: 100n, rate: 10n, maxLockupPeriod: 50n };
const empty: ApprovalIncreaseInput = { lockup: "", rate: "", maxLockupPeriod: "", isUnlimited: false };
const compute = (input: Partial<ApprovalIncreaseInput>) =>
  computeIncreasedApproval({ ...empty, ...input }, current, 18);

describe("computeIncreasedApproval", () => {
  it("adds parsed increases to the current totals", () => {
    expect(compute({ lockup: "1.5", rate: "2", maxLockupPeriod: "7" })).toEqual({
      lockup: 100n + 1_500_000_000_000_000_000n,
      rate: 10n + 2_000_000_000_000_000_000n,
      maxLockupPeriod: 57n,
    });
  });

  it("treats empty fields as zero", () => {
    expect(compute({})).toEqual(current);
  });

  it("returns unlimited totals regardless of the typed values", () => {
    expect(compute({ isUnlimited: true, lockup: "1e5", maxLockupPeriod: "1.5" })).toEqual({
      lockup: maxUint256,
      rate: maxUint256,
      maxLockupPeriod: maxUint256,
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
    expect(compute(input)).toBeNull();
  });
});
