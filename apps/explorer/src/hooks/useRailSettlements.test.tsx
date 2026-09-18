import { act, create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { useRailSettlements } from "./useRailSettlements";

const { toast, waitForTransactionReceipt, writeContractAsync } = vi.hoisted(() => ({
  toast: { dismiss: vi.fn(), error: vi.fn(), loading: vi.fn(), success: vi.fn() },
  waitForTransactionReceipt: vi.fn(() => ({ isSuccess: false, isError: false })),
  writeContractAsync: vi.fn(async () => "0x3333333333333333333333333333333333333333333333333333333333333333"),
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: waitForTransactionReceipt,
  useWriteContract: () => ({ writeContractAsync }),
}));

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
