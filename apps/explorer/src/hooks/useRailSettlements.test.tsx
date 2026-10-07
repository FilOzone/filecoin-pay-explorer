// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRailSettlements } from "./useRailSettlements";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
  invalidateAccountQueries: vi.fn(async () => undefined),
  writeContractAsync: vi.fn(),
  wallet: { address: "0x1111111111111111111111111111111111111111", chainId: 314 },
  receipts: new Map<string, (receipt: TransactionReceipt) => void>(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/utils/query-invalidation", () => ({ invalidateAccountQueries: mocks.invalidateAccountQueries }));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync, isPending: false }),
  usePublicClient: () => ({
    waitForTransactionReceipt: ({ hash }: { hash: string }) =>
      new Promise<TransactionReceipt>((resolve) => mocks.receipts.set(hash, resolve)),
  }),
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => mocks.wallet }));

const mount = () =>
  renderHook(() =>
    useRailSettlements({
      account: ACCOUNT,
      abi: [],
      chainId: 314,
      chainName: "Filecoin - Mainnet",
      contractAddress: CONTRACT,
    }),
  );

const params = (railId: bigint) => ({
  railId,
  untilEpoch: 2n,
  settlementAmount: 3n,
  tokenSymbol: "USDFC",
  tokenDecimals: 18,
});

const land = (hash: string, status: "success" | "reverted") =>
  act(async () =>
    mocks.receipts.get(hash)?.({ from: ACCOUNT, transactionHash: hash, status } as unknown as TransactionReceipt),
  );

afterEach(cleanup);

describe("useRailSettlements", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.wallet.chainId = 314;
    mocks.receipts.clear();
    mocks.invalidateAccountQueries.mockClear();
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    // The pending title names the rail, so it doubles as a recognisable toast id.
    mocks.toast.loading.mockReset().mockImplementation((title: string) => title);
    mocks.writeContractAsync.mockReset().mockImplementation(async ({ args }) => `0x${args[0]}`);
  });

  it("writes settleRail on the displayed Filecoin chain for the connected account", async () => {
    const { result } = mount();
    await act(() => result.current.settleRail(params(1n)));

    expect(mocks.writeContractAsync).toHaveBeenCalledWith({
      account: ACCOUNT,
      address: CONTRACT,
      abi: [],
      chainId: 314,
      functionName: "settleRail",
      args: [1n, 2n],
      value: undefined,
    });
  });

  it("marks a rail as settling while its wallet signature is pending", async () => {
    let submit!: (hash: string) => void;
    mocks.writeContractAsync.mockReturnValue(new Promise((resolve) => (submit = resolve)));
    const { result } = mount();

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.settleRail(params(1n));
    });
    expect(result.current.isSettling("1")).toBe(true);

    await act(async () => {
      submit("0x1");
      await pending;
    });
    expect(result.current.isSettling("1")).toBe(true);
  });

  // Regression: receipts were watched one at a time, so a second settlement's toast waited on the first's receipt.
  it("resolves each of two concurrent settlements on its own receipt", async () => {
    const { result } = mount();
    await act(() => result.current.settleRail(params(1n)));
    await act(() => result.current.settleRail(params(2n)));

    await land("0x2", "success");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(mocks.toast.success.mock.calls[0][1]).toMatchObject({ id: "Settling Rail #2" });
    expect([result.current.isSettling("1"), result.current.isSettling("2")]).toEqual([true, false]);

    await land("0x1", "success");
    expect(mocks.toast.success.mock.calls[1][1]).toMatchObject({ id: "Settling Rail #1" });
    expect([result.current.isSettling("1"), result.current.isSettling("2")]).toEqual([false, false]);
    expect(mocks.invalidateAccountQueries).toHaveBeenCalledTimes(2);
  });

  it("reports a reverted settlement as failed and never as settled", async () => {
    const { result } = mount();
    await act(() => result.current.settleRail(params(1n)));

    await land("0x1", "reverted");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAccountQueries).not.toHaveBeenCalled();
    expect(result.current.isSettling("1")).toBe(false);
  });

  it("tells the user to switch networks when the wallet is on another chain", async () => {
    mocks.wallet.chainId = 8453;
    const { result } = mount();

    await act(async () => {
      await expect(result.current.settleRail(params(1n))).rejects.toThrow();
    });

    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Transaction Rejected", {
      description: "Your wallet is on another network. Switch it to Filecoin - Mainnet and try again.",
      duration: 4000,
    });
    expect(result.current.isSettling("1")).toBe(false);
  });
});
