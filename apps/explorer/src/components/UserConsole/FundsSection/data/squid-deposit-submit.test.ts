import { describe, expect, it } from "vitest";
import {
  assertSquidDepositContext,
  claimSquidDepositSubmission,
  releaseSquidDepositSubmission,
} from "./squid-deposit-submit";

const reviewed = {
  owner: "0x1111111111111111111111111111111111111111",
  recipient: "0x2222222222222222222222222222222222222222",
  sourceAmount: 100n,
  sourceChainId: 8453,
  sourceToken: "0x3333333333333333333333333333333333333333",
} as const;

const current = {
  amount: reviewed.sourceAmount,
  chainId: reviewed.sourceChainId,
  open: true,
  owner: reviewed.owner,
  recipient: reviewed.recipient,
  token: reviewed.sourceToken,
};

describe("Squid deposit submission guard", () => {
  it("claims synchronously so two confirm events cannot start two executions", () => {
    const submitting = { current: false };
    expect(claimSquidDepositSubmission(submitting)).toBe(true);
    expect(claimSquidDepositSubmission(submitting)).toBe(false);
    releaseSquidDepositSubmission(submitting);
    expect(claimSquidDepositSubmission(submitting)).toBe(true);
  });

  it.each([
    ["a changed destination account", current, "0x4444444444444444444444444444444444444444", true],
    ["an unmounted dialog", current, reviewed.recipient, false],
    [
      "source-token drift",
      { ...current, token: "0x4444444444444444444444444444444444444444" },
      reviewed.recipient,
      true,
    ],
    ["source-amount drift", { ...current, amount: 101n }, reviewed.recipient, true],
  ] as const)("rejects %s after review", (_label, next, liveRecipient, mounted) => {
    expect(() => assertSquidDepositContext(next, reviewed, liveRecipient, mounted)).toThrow(
      "Funding details changed after review",
    );
  });

  it("accepts the unchanged reviewed context", () => {
    expect(() => assertSquidDepositContext(current, reviewed, reviewed.recipient, true)).not.toThrow();
  });
});
