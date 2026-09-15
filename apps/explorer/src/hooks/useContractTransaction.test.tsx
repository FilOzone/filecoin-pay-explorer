import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useContractTransaction } from "./useContractTransaction";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const CONTRACT = "0x2222222222222222222222222222222222222222" as const;
const CHAIN_ID = 314;

const mocks = vi.hoisted(() => ({
  account: {
    address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
    chainId: 314 as number | undefined,
  },
  invalidateAccountQueries: vi.fn(async () => undefined),
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(() => ({
    data: undefined as { from: `0x${string}` } | undefined,
    isSuccess: false,
    isError: false,
  })),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/utils/query-invalidation", () => ({
  invalidateAccountQueries: mocks.invalidateAccountQueries,
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useWaitForTransactionReceipt: mocks.waitForTransactionReceipt,
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync, isPending: false }),
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => mocks.account }));

function renderHook() {
  let result!: ReturnType<typeof useContractTransaction>;
  let renderer!: ReturnType<typeof create>;
  function Harness() {
    result = useContractTransaction({
      account: ACCOUNT,
      abi: [],
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
    });
    return null;
  }
  act(() => {
    renderer = create(<Harness />);
  });
  return {
    getHook: () => result,
    rerender: () => act(() => renderer.update(<Harness />)),
  };
}

describe("useContractTransaction", () => {
  beforeEach(() => {
    mocks.account = { address: ACCOUNT, chainId: CHAIN_ID };
    mocks.invalidateAccountQueries.mockClear();
    mocks.writeContractAsync.mockReset().mockResolvedValue(`0x${"1".repeat(64)}`);
    mocks.waitForTransactionReceipt.mockReset().mockReturnValue({
      data: undefined,
      isSuccess: false,
      isError: false,
    });
  });

  it("watches the receipt on the transaction's pinned chain", () => {
    renderHook();

    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      chainId: CHAIN_ID,
      hash: undefined,
      query: { enabled: false },
    });
  });

  it("rejects a write from a different network", async () => {
    const { getHook } = renderHook();
    mocks.account = { address: ACCOUNT, chainId: 314159 };

    await expect(
      getHook().execute({ functionName: "depositWithPermit", args: [], metadata: { type: "deposit" } }),
    ).rejects.toThrow("connected network changed");
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("rejects a write from a different account", async () => {
    const { getHook } = renderHook();
    mocks.account = { address: CONTRACT, chainId: CHAIN_ID };

    await expect(
      getHook().execute({ functionName: "deposit", args: [], metadata: { type: "deposit" } }),
    ).rejects.toThrow("connected wallet changed");
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("pins the intended account and chain on a valid write", async () => {
    const { getHook } = renderHook();
    await getHook().execute({ functionName: "deposit", args: [1n], metadata: { type: "deposit" } });

    expect(mocks.writeContractAsync).toHaveBeenCalledWith({
      account: ACCOUNT,
      address: CONTRACT,
      abi: [],
      chainId: CHAIN_ID,
      functionName: "deposit",
      args: [1n],
      value: undefined,
    });
  });

  it("refreshes the account only after a successful receipt", async () => {
    const { getHook, rerender } = renderHook();

    await act(async () => {
      await getHook().execute({ functionName: "deposit", args: [1n], metadata: { type: "deposit" } });
    });
    expect(mocks.invalidateAccountQueries).not.toHaveBeenCalled();

    mocks.waitForTransactionReceipt.mockReturnValue({
      data: { from: ACCOUNT },
      isSuccess: true,
      isError: false,
    });
    rerender();

    expect(mocks.invalidateAccountQueries).toHaveBeenCalledOnce();
    expect(mocks.invalidateAccountQueries).toHaveBeenCalledWith(expect.anything(), ACCOUNT);
  });
});
