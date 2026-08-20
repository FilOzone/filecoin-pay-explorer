import { executeSquidFunding, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import { executeSquidTopUp, isUserRejectedRequest, walletErrorMessage } from "./squid-execution";

vi.mock("@filecoin-project/squid-evm-funding", () => ({
  executeSquidFunding: vi.fn(),
  SQUID_ROUTER_ADDRESS: "0x1111111111111111111111111111111111111111",
}));

const source = {
  chainId: 10,
  decimals: 18,
  symbol: "ETH",
  token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
} as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
describe("executeSquidTopUp", () => {
  it("executes the reviewed OP Stack plan with an explicit fee cap and trusted router", async () => {
    const plan = { maxSourceAmount: 2_000_000_000_000_000_000n, owner, quotes: [], slippage: 1, source };
    vi.mocked(executeSquidFunding).mockResolvedValue({ nativeFee: 1n, routes: [], sourceAmount: 2n });

    await executeSquidTopUp({
      destinationClient: {} as never,
      integratorId: "test-integrator",
      maxNativeFee: 3n,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: {} as never,
    });

    expect(executeSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        feeMode: "op-stack",
        maxNativeFee: 3n,
        trustedSpender: SQUID_ROUTER_ADDRESS,
        trustedTarget: SQUID_ROUTER_ADDRESS,
        plan,
      }),
      expect.objectContaining({
        destinationClient: expect.anything(),
        publicClient: expect.anything(),
        walletClient: expect.anything(),
      }),
    );
  });

  it("reports a transaction as soon as the wallet broadcasts it", async () => {
    const transactionHash = `0x${"4".repeat(64)}` as const;
    const onBroadcast = vi.fn();
    const sendTransaction = vi.fn().mockResolvedValue(transactionHash);
    const plan = { maxSourceAmount: 2n, owner, quotes: [], slippage: 1, source };
    vi.mocked(executeSquidFunding).mockImplementation(async (_input, dependencies) => {
      await dependencies.walletClient.sendTransaction({} as never);
      return { nativeFee: 1n, routes: [], sourceAmount: 2n };
    });

    await executeSquidTopUp({
      destinationClient: {} as never,
      integratorId: "test-integrator",
      maxNativeFee: 3n,
      onBroadcast,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: { sendTransaction } as never,
    });

    expect(onBroadcast).toHaveBeenCalledWith(transactionHash);
  });

  it("reports an attempted transaction even when the wallet loses the response", async () => {
    const onTransactionAttempt = vi.fn();
    vi.mocked(executeSquidFunding).mockImplementation(async (_input, dependencies) => {
      await dependencies.walletClient.sendTransaction({} as never);
      return { nativeFee: 1n, routes: [], sourceAmount: 2n };
    });

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 3n,
        onTransactionAttempt,
        plan: { maxSourceAmount: 2n, owner, quotes: [], slippage: 1, source },
        sourcePublicClient: {} as never,
        sourceWalletClient: { sendTransaction: vi.fn().mockRejectedValue(new Error("response lost")) } as never,
      }),
    ).rejects.toThrow("response lost");
    expect(onTransactionAttempt).toHaveBeenCalledOnce();
  });

  it("recognizes nested wallet rejection errors", () => {
    expect(isUserRejectedRequest({ cause: { code: 4001 } })).toBe(true);
    expect(isUserRejectedRequest(new Error("response lost"))).toBe(false);
  });

  it("shortens wallet rejection errors without hiding other failures", () => {
    expect(walletErrorMessage({ cause: { code: 4001 } }, "fallback")).toBe("Transaction cancelled in your wallet.");
    expect(walletErrorMessage(new Error("response lost"), "fallback")).toBe("response lost");
    expect(walletErrorMessage(null, "fallback")).toBe("fallback");
  });
});
