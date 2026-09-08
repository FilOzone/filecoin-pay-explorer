import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureWalletChain, waitForWalletChain } from "./wallet-chain";

const noSleep = async () => undefined;

describe("waitForWalletChain", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves at once when the provider already reports the chain, in hex or decimal", async () => {
    const hex = { request: vi.fn(async () => "0x1") };
    await expect(waitForWalletChain(hex, 1, { sleep: noSleep })).resolves.toBe(true);
    expect(hex.request).toHaveBeenCalledTimes(1);

    const decimal = { request: vi.fn(async () => "8453") };
    await expect(waitForWalletChain(decimal, 8453, { sleep: noSleep })).resolves.toBe(true);
  });

  it("polls until the provider catches up with the switch", async () => {
    const answers = ["0x13a", "0x13a", "0x2105"];
    const provider = { request: vi.fn(async () => answers.shift() ?? "0x2105") };

    await expect(waitForWalletChain(provider, 8453, { sleep: noSleep })).resolves.toBe(true);
    expect(provider.request).toHaveBeenCalledTimes(3);
  });

  it("gives up after the timeout and tolerates a failing request", async () => {
    const provider = {
      request: vi.fn(async () => {
        throw new Error("provider gone");
      }),
    };
    const sleep = vi.fn(async (milliseconds: number) => {
      vi.advanceTimersByTime(milliseconds);
    });

    await expect(waitForWalletChain(provider, 1, { sleep, timeoutMs: 250 })).resolves.toBe(false);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});

describe("ensureWalletChain", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not ask for a switch when the provider is already on the chain", async () => {
    const provider = { request: vi.fn(async () => "0x1") };
    await expect(ensureWalletChain(provider, 1, { sleep: noSleep })).resolves.toBe(true);
    expect(provider.request.mock.calls).toEqual([[{ method: "eth_chainId" }]]);
  });

  it("asks the provider itself to switch when it still reports the old chain, then waits for it", async () => {
    let chain = "0x13a";
    const provider = {
      request: vi.fn(async ({ method, params }: { method: string; params?: [{ chainId: string }] }) => {
        if (method === "wallet_switchEthereumChain") {
          chain = params?.[0].chainId ?? chain;
          return null;
        }
        return chain;
      }),
    };

    await expect(ensureWalletChain(provider, 1, { sleep: noSleep })).resolves.toBe(true);
    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
  });

  it("reports failure when the provider refuses the switch", async () => {
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "wallet_switchEthereumChain") throw new Error("User rejected the request.");
        return "0x13a";
      }),
    };
    const sleep = vi.fn(async (milliseconds: number) => {
      vi.advanceTimersByTime(milliseconds);
    });

    await expect(ensureWalletChain(provider, 1, { sleep, timeoutMs: 250 })).resolves.toBe(false);
  });
});
