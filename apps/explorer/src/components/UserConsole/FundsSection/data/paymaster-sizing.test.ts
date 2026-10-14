import { describe, expect, it, vi } from "vitest";
import { type PaymasterSizingQuotes, sizePaymasterDeposit } from "./paymaster-sizing";

type Route = { transaction: { value: bigint } };

const nativeFee = 300_000_000_000_000n;

function quotes({
  fee = nativeFee,
  swapInput = 731_894n,
  gasMaximum = () => 24_740n,
}: {
  fee?: bigint;
  swapInput?: bigint;
  gasMaximum?: () => bigint;
} = {}) {
  return {
    quoteRoute: vi.fn(async (_amount: bigint): Promise<Route> => ({ transaction: { value: fee } })),
    quoteSwapInput: vi.fn(async (_fee: bigint) => swapInput),
    estimateGasMaximum: vi.fn(async () => gasMaximum()),
  } satisfies PaymasterSizingQuotes<Route>;
}

describe("sizePaymasterDeposit", () => {
  it("re-quotes at what the reserves leave, then keeps the quote whose reserves fit", async () => {
    const sizing = quotes();

    await expect(sizePaymasterDeposit(10_000_000n, sizing)).resolves.toEqual({
      kind: "sized",
      amount: 9_243_366n,
      route: { transaction: { value: nativeFee } },
      maxSwapInput: 731_894n,
      gasMaximum: 24_740n,
    });
    expect(sizing.quoteRoute.mock.calls).toEqual([[10_000_000n], [9_243_366n]]);
    expect(sizing.quoteSwapInput.mock.calls).toEqual([[nativeFee], [nativeFee]]);
  });

  it("reserves no swap when the route carries no native fee", async () => {
    const sizing = quotes({ fee: 0n });

    await expect(sizePaymasterDeposit(10_000_000n, sizing)).resolves.toMatchObject({
      kind: "sized",
      amount: 9_975_260n,
      maxSwapInput: 0n,
    });
    expect(sizing.quoteSwapInput).not.toHaveBeenCalled();
  });

  it("reports the reserve when the swap cap and gas maximum use up the balance", async () => {
    await expect(sizePaymasterDeposit(500_000n, quotes())).resolves.toEqual({
      kind: "insufficient-usdc",
      reserved: 756_634n,
    });
  });

  it("treats a balance that exactly covers the reserves as insufficient", async () => {
    await expect(sizePaymasterDeposit(756_634n, quotes())).resolves.toEqual({
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
