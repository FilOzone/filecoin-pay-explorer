import { describe, expect, it, vi } from "vitest";
import { type PaymasterSizingQuotes, sizePaymasterDeposit } from "./paymaster-sizing";

const nativeFee = 300_000_000_000_000n;

function quotes({ gasMaximum = () => 24_740n }: { gasMaximum?: () => bigint } = {}) {
  return {
    quoteRoute: vi.fn(async (amount: bigint) => ({ route: `route for ${amount}`, nativeFee })),
    quoteSwapInput: vi.fn(async (_fee: bigint) => 731_894n),
    estimateGasMaximum: vi.fn(async (_route: string) => gasMaximum()),
  } satisfies PaymasterSizingQuotes<string>;
}

describe("sizePaymasterDeposit", () => {
  it("re-quotes at what the reserves leave, then keeps the quote whose reserves fit", async () => {
    const sizing = quotes();

    await expect(sizePaymasterDeposit(10_000_000n, sizing)).resolves.toEqual({
      kind: "sized",
      amount: 9_243_366n,
      route: "route for 9243366",
      nativeFee,
      maxSwapInput: 731_894n,
      gasMaximum: 24_740n,
    });
    expect(sizing.quoteRoute.mock.calls).toEqual([[10_000_000n], [9_243_366n]]);
    expect(sizing.quoteSwapInput.mock.calls).toEqual([[nativeFee], [nativeFee]]);
    expect(sizing.estimateGasMaximum.mock.calls).toEqual([["route for 10000000"], ["route for 9243366"]]);
  });

  it.each([
    ["the swap cap and gas maximum use up the balance", 500_000n],
    ["the balance exactly covers the reserves", 756_634n],
  ])("reports the reserve as insufficient when %s", async (_label, balance) => {
    await expect(sizePaymasterDeposit(balance, quotes())).resolves.toEqual({
      kind: "insufficient-usdc",
      reserved: 756_634n,
    });
  });

  it("stops after three quotes when every re-quote needs more reserve than the last", async () => {
    let gasMaximum = 24_740n;
    const sizing = quotes({ gasMaximum: () => (gasMaximum += 1_000n) });

    await expect(sizePaymasterDeposit(10_000_000n, sizing)).resolves.toEqual({ kind: "not-converged" });
    expect(sizing.quoteRoute).toHaveBeenCalledTimes(3);
  });
});
