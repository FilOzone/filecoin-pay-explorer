import { describe, expect, it } from "vitest";
import { claimSquidDepositSubmission, releaseSquidDepositSubmission } from "./squid-deposit-submit";

describe("Squid deposit submission guard", () => {
  it("claims synchronously so two confirm events cannot start two executions", () => {
    const submitting = { current: false };
    expect(claimSquidDepositSubmission(submitting)).toBe(true);
    expect(claimSquidDepositSubmission(submitting)).toBe(false);
    releaseSquidDepositSubmission(submitting);
    expect(claimSquidDepositSubmission(submitting)).toBe(true);
  });
});
