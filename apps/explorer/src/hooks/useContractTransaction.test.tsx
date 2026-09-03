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
  writeContractAsync: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), loading: vi.fn() } }));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: () => ({ isSuccess: false, isError: false }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync, isPending: false }),
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => mocks.account }));
vi.mock("@/services/wagmi/config", () => ({ config: {} }));

function renderHook() {
  let result!: ReturnType<typeof useContractTransaction>;
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
    create(<Harness />);
  });
  return () => result;
}

describe("useContractTransaction", () => {
  beforeEach(() => {
    mocks.account = { address: ACCOUNT, chainId: CHAIN_ID };
    mocks.writeContractAsync.mockReset().mockResolvedValue(`0x${"1".repeat(64)}`);
  });

  it("rejects a write when the network changes while prior authorization is pending", async () => {
    const getHook = renderHook();
    let finishAuthorization!: () => void;
    const authorization = new Promise<void>((resolve) => {
      finishAuthorization = resolve;
    });
    const submission = authorization.then(() =>
      getHook().execute({ functionName: "depositWithPermit", args: [], metadata: { type: "deposit" } }),
    );

    mocks.account = { address: ACCOUNT, chainId: 314159 };
    finishAuthorization();

    await expect(submission).rejects.toThrow("connected network changed");
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("rejects a write from a different account", async () => {
    const getHook = renderHook();
    mocks.account = { address: CONTRACT, chainId: CHAIN_ID };

    await expect(
      getHook().execute({ functionName: "deposit", args: [], metadata: { type: "deposit" } }),
    ).rejects.toThrow("connected wallet changed");
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("pins the intended account and chain on a valid write", async () => {
    const getHook = renderHook();
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
});
