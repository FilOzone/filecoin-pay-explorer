import { describe, expect, it } from "vitest";
import { getDelegationState, isPaymasterEligible, type PaymasterEligibilityInput } from "./paymaster-eligibility";

const ourDelegation = "0xef0100e6cae83bde06e4c305530e199d7217f42808555b";

describe("getDelegationState", () => {
  it.each([
    ["no code", undefined, "none"],
    ["empty code", "0x", "none"],
    ["our delegate", ourDelegation, "ours"],
    ["our delegate, checksummed", "0xef0100E6cAE83BdE06E4c305530e199D7217f42808555B", "ours"],
    ["another delegate", "0xef01001111111111111111111111111111111111111111", "conflict"],
    ["contract code", "0x6080604052", "conflict"],
  ] as const)("%s → %s", (_label, code, expected) => {
    expect(getDelegationState(code)).toBe(expected);
  });
});

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
