import { executeSquidFunding, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  applyNetworkFeeExecutionBuffer,
  canClearSquidAcquisitionAfterError,
  executeSquidTopUp,
  isUserRejectedRequest,
  walletErrorMessage,
} from "./squid-execution";

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
  it("applies the same rounded OP Stack buffer used by reviewed fee caps", () => {
    expect(applyNetworkFeeExecutionBuffer(8453, 3n)).toBe(4n);
    expect(applyNetworkFeeExecutionBuffer(1, 3n)).toBe(3n);
  });

  it("executes the reviewed OP Stack plan with an explicit fee cap and a trusted router", async () => {
    const plan = { maxSourceAmount: 2_000_000_000_000_000_000n, owner, quotes: [], slippage: 1, source };
    vi.mocked(executeSquidFunding).mockResolvedValue({ nativeFee: 1n, routes: [], sourceAmount: 2n });

    await executeSquidTopUp({
      destinationClient: {} as never,
      integratorId: "test-integrator",
      maxNativeFee: 30n,
      maxTotalNativeRouteFee: 20n,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: {} as never,
    });

    expect(executeSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        feeMode: "op-stack",
        maxNativeFee: 30n,
        maxTotalNativeRouteFee: 20n,
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

  it("reports only the Squid transaction as attempted and broadcast", async () => {
    const transactionHash = `0x${"4".repeat(64)}` as const;
    const approvalHash = `0x${"3".repeat(64)}` as const;
    const onSwapAttempt = vi.fn();
    const onSwapBroadcast = vi.fn();
    const sendTransaction = vi.fn().mockResolvedValue(transactionHash);
    const plan = { maxSourceAmount: 2n, owner, quotes: [], slippage: 1, source };
    vi.mocked(executeSquidFunding).mockImplementation(async (_input, dependencies) => {
      sendTransaction.mockResolvedValueOnce(approvalHash).mockResolvedValueOnce(transactionHash);
      await dependencies.walletClient.sendTransaction({ to: source.token } as never);
      await dependencies.walletClient.sendTransaction({ to: SQUID_ROUTER_ADDRESS } as never);
      return { nativeFee: 1n, routes: [], sourceAmount: 2n };
    });

    await executeSquidTopUp({
      destinationClient: {} as never,
      integratorId: "test-integrator",
      maxNativeFee: 30n,
      maxTotalNativeRouteFee: 20n,
      onSwapAttempt,
      onSwapBroadcast,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: { sendTransaction } as never,
    });

    expect(onSwapAttempt).toHaveBeenCalledOnce();
    expect(onSwapBroadcast).toHaveBeenCalledOnce();
    expect(onSwapBroadcast).toHaveBeenCalledWith(transactionHash);
  });

  it("reports an attempted swap even when the wallet loses the response", async () => {
    const onSwapAttempt = vi.fn();
    vi.mocked(executeSquidFunding).mockImplementation(async (_input, dependencies) => {
      await dependencies.walletClient.sendTransaction({ to: SQUID_ROUTER_ADDRESS } as never);
      return { nativeFee: 1n, routes: [], sourceAmount: 2n };
    });

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 30n,
        maxTotalNativeRouteFee: 20n,
        onSwapAttempt,
        plan: { maxSourceAmount: 2n, owner, quotes: [], slippage: 1, source },
        sourcePublicClient: {} as never,
        sourceWalletClient: { sendTransaction: vi.fn().mockRejectedValue(new Error("response lost")) } as never,
      }),
    ).rejects.toThrow("response lost");
    expect(onSwapAttempt).toHaveBeenCalledOnce();
  });

  it("does not report an approval attempt when its response is lost", async () => {
    const onSwapAttempt = vi.fn();
    vi.mocked(executeSquidFunding).mockImplementation(async (_input, dependencies) => {
      await dependencies.walletClient.sendTransaction({ to: source.token } as never);
      return { nativeFee: 1n, routes: [], sourceAmount: 2n };
    });

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 30n,
        maxTotalNativeRouteFee: 20n,
        onSwapAttempt,
        plan: { maxSourceAmount: 2n, owner, quotes: [], slippage: 1, source },
        sourcePublicClient: {} as never,
        sourceWalletClient: { sendTransaction: vi.fn().mockRejectedValue(new Error("response lost")) } as never,
      }),
    ).rejects.toThrow("response lost");
    expect(onSwapAttempt).not.toHaveBeenCalled();
  });

  it("clears recovery state only before a swap attempt or after an unbroadcast rejection", () => {
    expect(canClearSquidAcquisitionAfterError(false, false, new Error("approval response lost"))).toBe(true);
    expect(canClearSquidAcquisitionAfterError(true, false, { code: 4001 })).toBe(true);
    expect(canClearSquidAcquisitionAfterError(true, true, { code: 4001 })).toBe(false);
    expect(canClearSquidAcquisitionAfterError(true, false, new Error("response lost"))).toBe(false);
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
