import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { TransactionReceipt } from "viem";
import { beforeEach, expect, it, vi } from "vitest";
import { useRailSettlements } from "./useRailSettlements";

const { invalidateAccountQueries, receiptState, toast, waitForTransactionReceipt, writeContractAsync } = vi.hoisted(
  () => {
    const receiptState = {
      data: undefined as TransactionReceipt | undefined,
      error: undefined as Error | undefined,
      isSuccess: false,
      isError: false,
    };
    return {
      invalidateAccountQueries: vi.fn(async () => undefined),
      receiptState,
      toast: { dismiss: vi.fn(), error: vi.fn(), loading: vi.fn(), success: vi.fn() },
      waitForTransactionReceipt: vi.fn(() => receiptState),
      writeContractAsync: vi.fn(async () => "0x3333333333333333333333333333333333333333333333333333333333333333"),
    };
  },
);

vi.mock("sonner", () => ({ toast }));
vi.mock("@/utils/query-invalidation", () => ({ invalidateAccountQueries }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: waitForTransactionReceipt,
  useWriteContract: () => ({ writeContractAsync }),
}));

beforeEach(() => {
  receiptState.data = undefined;
  receiptState.error = undefined;
  receiptState.isSuccess = false;
  receiptState.isError = false;
  invalidateAccountQueries.mockClear();
  toast.error.mockClear();
  toast.success.mockClear();
});

const FAILURE_MESSAGES = {
  // @wagmi/core 3 throws on a reverted receipt, so a real revert arrives as an error without data.
  "wagmi-revert": "Execution reverted with reason: rail already settled to epoch.",
  // A success result carrying a reverted receipt, which the status check guards against.
  reverted: "Settlement transaction reverted",
  // A failed receipt poll keeps the earlier data.
  "rpc-error": "Receipt RPC failed",
} as const;

async function renderSettlementResult(resultType: "success" | keyof typeof FAILURE_MESSAGES) {
  const onSettlementSuccess = vi.fn();
  const onSettlementError = vi.fn();
  let result: ReturnType<typeof useRailSettlements> | undefined;
  let renderer!: ReactTestRenderer;
  function Harness() {
    result = useRailSettlements({
      account: "0x1111111111111111111111111111111111111111",
      abi: [],
      chainId: 314,
      contractAddress: "0x2222222222222222222222222222222222222222",
      onSettlementError,
      onSettlementSuccess,
    });
    return null;
  }
  act(() => {
    renderer = create(<Harness />);
  });
  await act(async () => {
    await result?.settleRail({
      railId: 1n,
      untilEpoch: 2n,
      settlementAmount: 3n,
      tokenSymbol: "USDFC",
      tokenDecimals: 18,
    });
  });
  const receipt = {
    from: "0x1111111111111111111111111111111111111111",
    status: resultType === "reverted" ? "reverted" : "success",
  } as unknown as TransactionReceipt;
  receiptState.data = resultType === "wagmi-revert" ? undefined : receipt;
  receiptState.isSuccess = resultType === "success" || resultType === "reverted";
  receiptState.isError = !receiptState.isSuccess;
  receiptState.error =
    resultType === "wagmi-revert" || resultType === "rpc-error" ? new Error(FAILURE_MESSAGES[resultType]) : undefined;
  await act(async () => {
    renderer.update(<Harness />);
  });
  // The settled transaction leaves the queue, so a later render cannot report it again.
  await act(async () => {
    renderer.update(<Harness />);
  });

  expect(result?.settlements.size).toBe(0);
  expect(waitForTransactionReceipt).toHaveBeenLastCalledWith({
    chainId: 314,
    hash: undefined,
    query: { enabled: false },
  });
  return { onSettlementError, onSettlementSuccess, receipt };
}

it("handles a successful settlement once", async () => {
  const { onSettlementError, onSettlementSuccess, receipt } = await renderSettlementResult("success");
  expect(toast.success).toHaveBeenCalledOnce();
  expect(onSettlementSuccess).toHaveBeenCalledOnce();
  expect(onSettlementSuccess).toHaveBeenCalledWith("1", receipt);
  expect(invalidateAccountQueries).toHaveBeenCalledOnce();
  expect(onSettlementError).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

it.each([
  "wagmi-revert",
  "reverted",
  "rpc-error",
] as const)("handles a %s settlement failure once", async (resultType) => {
  const { onSettlementError, onSettlementSuccess } = await renderSettlementResult(resultType);
  expect(toast.error).toHaveBeenCalledOnce();
  expect(onSettlementError).toHaveBeenCalledOnce();
  expect(onSettlementError).toHaveBeenCalledWith(
    "1",
    expect.objectContaining({ message: FAILURE_MESSAGES[resultType] }),
  );
  expect(onSettlementSuccess).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(invalidateAccountQueries).not.toHaveBeenCalled();
});

it("pins settlement writes and receipts to the displayed Filecoin chain", async () => {
  let result: ReturnType<typeof useRailSettlements> | undefined;

  function Harness() {
    result = useRailSettlements({
      account: "0x1111111111111111111111111111111111111111",
      abi: [],
      chainId: 314,
      contractAddress: "0x2222222222222222222222222222222222222222",
    });
    return null;
  }

  act(() => {
    create(<Harness />);
  });

  expect(waitForTransactionReceipt).toHaveBeenCalledWith({
    chainId: 314,
    hash: undefined,
    query: { enabled: false },
  });

  await act(async () => {
    await result?.settleRail({
      railId: 1n,
      untilEpoch: 2n,
      settlementAmount: 3n,
      tokenSymbol: "USDFC",
      tokenDecimals: 18,
    });
  });

  expect(writeContractAsync).toHaveBeenCalledWith({
    account: "0x1111111111111111111111111111111111111111",
    address: "0x2222222222222222222222222222222222222222",
    abi: [],
    chainId: 314,
    functionName: "settleRail",
    args: [1n, 2n],
  });
});

it("tells the user to switch networks when the wallet is on another chain", async () => {
  const mismatch = Object.assign(new Error("The current chain of the wallet (id: 8453) does not match"), {
    name: "ChainMismatchError",
  });
  writeContractAsync.mockRejectedValueOnce(Object.assign(new Error("Contract write failed"), { cause: mismatch }));
  let result: ReturnType<typeof useRailSettlements> | undefined;

  function Harness() {
    result = useRailSettlements({
      account: "0x1111111111111111111111111111111111111111",
      abi: [],
      chainId: 314,
      chainName: "Filecoin Mainnet",
      contractAddress: "0x2222222222222222222222222222222222222222",
    });
    return null;
  }

  act(() => {
    create(<Harness />);
  });

  await act(async () => {
    await expect(
      result?.settleRail({ railId: 1n, untilEpoch: 2n, settlementAmount: 3n, tokenSymbol: "USDFC", tokenDecimals: 18 }),
    ).rejects.toThrow("Contract write failed");
  });

  expect(toast.error).toHaveBeenLastCalledWith("Settlement Rejected", {
    description: "Your wallet is on another network. Switch it to Filecoin Mainnet and try again.",
    duration: 4000,
  });
});
