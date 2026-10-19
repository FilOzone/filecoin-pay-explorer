import { describe, expect, it } from "vitest";
import { isPaymasterEligible, type PaymasterEligibilityInput } from "./paymaster-eligibility";

describe("isPaymasterEligible", () => {
  const eligible: PaymasterEligibilityInput = {
    enabled: true,
    wallet: { walletClientType: "privy" },
    sourceChainId: 8453,
    sourceToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    nativeBalance: 0n,
    requiredNative: 400_000_000_000_000n,
  };

  it("takes an embedded wallet paying Base USDC without the ETH it needs", () => {
    expect(isPaymasterEligible(eligible)).toBe(true);
  });

  it.each([
    ["the flag is off", { enabled: false }],
    ["the wallet is an extension", { wallet: { walletClientType: "metamask" } }],
    ["the source is another network", { sourceChainId: 42161 }],
    ["the source is another token", { sourceToken: "0x4200000000000000000000000000000000000006" }],
    ["the wallet already holds the ETH it needs", { nativeBalance: 400_000_000_000_000n }],
  ] as const)("keeps today's ETH path when %s", (_label, change) => {
    expect(isPaymasterEligible({ ...eligible, ...change })).toBe(false);
  });
});
