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
  maximumNativeRouteFee: (value: bigint) => value * 2n,
  NATIVE_TOKEN_ADDRESS: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
      nativeBalanceFloor: 250n,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: {} as never,
    });

    expect(executeSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        feeMode: "op-stack",
        maxNativeFee: 30n,
        maxTotalNativeRouteFee: 20n,
        nativeBalanceFloor: 250n,
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

  it("checkpoints a completed first requirement and preserves aggregate caps", async () => {
    const onIntermediateRouteComplete = vi.fn();
    const requirements = ["fil", "usdfc"];
    const plan = {
      maxSourceAmount: 20n,
      owner,
      quotes: requirements.map((id, index) => ({
        costs: [
          {
            amount: BigInt(index + 1),
            kind: "fee" as const,
            token: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chainId: 10 },
          },
        ],
        requirement: { amount: 1n, chainId: 314, id },
        sourceAmount: BigInt((index + 1) * 5),
      })),
      slippage: 1,
      source,
    } as never;
    vi.mocked(executeSquidFunding)
      .mockResolvedValueOnce({
        nativeFee: 3n,
        routes: [{ requirementId: "fil", transactionHash: `0x${"4".repeat(64)}` }],
        sourceAmount: 5n,
      })
      .mockResolvedValueOnce({
        nativeFee: 4n,
        routes: [{ requirementId: "usdfc", transactionHash: `0x${"5".repeat(64)}` }],
        sourceAmount: 10n,
      });

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 10n,
        maxTotalNativeRouteFee: 6n,
        onIntermediateRouteComplete,
        plan,
        sourcePublicClient: {} as never,
        sourceWalletClient: {} as never,
      }),
    ).resolves.toMatchObject({ nativeFee: 7n, sourceAmount: 15n });

    expect(executeSquidFunding).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxNativeFee: 10n, maxTotalNativeRouteFee: 2n, sourceBalanceFloor: 10n }),
      expect.anything(),
    );
    expect(executeSquidFunding).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxNativeFee: 7n, maxTotalNativeRouteFee: 4n, sourceBalanceFloor: 0n }),
      expect.anything(),
    );
    expect(onIntermediateRouteComplete).toHaveBeenCalledOnce();
  });

  it("rejects a multi-route plan above the reviewed aggregate route-fee cap", async () => {
    const plan = {
      maxSourceAmount: 20n,
      owner,
      quotes: [1n, 2n].map((amount, index) => ({
        costs: [
          {
            amount,
            kind: "fee" as const,
            token: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chainId: 10 },
          },
        ],
        requirement: { amount: 1n, chainId: 314, id: String(index) },
        sourceAmount: 5n,
      })),
      slippage: 1,
      source,
    } as never;
    vi.mocked(executeSquidFunding).mockResolvedValue({ nativeFee: 1n, routes: [], sourceAmount: 5n });

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 10n,
        maxTotalNativeRouteFee: 5n,
        plan,
        sourcePublicClient: {} as never,
        sourceWalletClient: {} as never,
      }),
    ).rejects.toThrow("Execution would exceed the total-native-route-fee cap");
    expect(executeSquidFunding).not.toHaveBeenCalled();
  });

  it("rejects a multi-route plan above its aggregate source cap before execution", async () => {
    const plan = {
      maxSourceAmount: 10n,
      owner,
      quotes: ["fil", "usdfc"].map((id) => ({
        costs: [],
        requirement: { amount: 1n, chainId: 314, id },
        sourceAmount: 8n,
      })),
      slippage: 1,
      source,
    } as never;

    await expect(
      executeSquidTopUp({
        destinationClient: {} as never,
        integratorId: "test-integrator",
        maxNativeFee: 10n,
        maxTotalNativeRouteFee: 0n,
        plan,
        sourcePublicClient: {} as never,
        sourceWalletClient: {} as never,
      }),
    ).rejects.toThrow("Invalid multi-route funding plan");
    expect(executeSquidFunding).not.toHaveBeenCalled();
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
    expect(canClearSquidAcquisitionAfterError("preparing", new Error("approval response lost"))).toBe(true);
    expect(canClearSquidAcquisitionAfterError("swap-requested", { code: 4001 })).toBe(true);
    expect(canClearSquidAcquisitionAfterError("swap-broadcast", { code: 4001 })).toBe(false);
    expect(canClearSquidAcquisitionAfterError("swap-requested", new Error("response lost"))).toBe(false);
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
