import { act, create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { useRailSettlements } from "./useRailSettlements";

const { waitForTransactionReceipt, writeContractAsync } = vi.hoisted(() => ({
  waitForTransactionReceipt: vi.fn(() => ({ isSuccess: false, isError: false })),
  writeContractAsync: vi.fn(async () => "0x3333333333333333333333333333333333333333333333333333333333333333"),
}));

vi.mock("sonner", () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), loading: vi.fn(), success: vi.fn() } }));
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
