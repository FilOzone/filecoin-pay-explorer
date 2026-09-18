import { act, create } from "react-test-renderer";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContractTransaction } from "./useContractTransaction";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const CONTRACT = "0x2222222222222222222222222222222222222222" as const;
const CHAIN_ID = 314;

vi.mock("sonner", () => ({ toast: { loading: vi.fn(() => "toast-id"), success: vi.fn(), error: vi.fn() } }));

const receipts = new Map<string, { resolve: (receipt: TransactionReceipt) => void }>();
const wagmi = vi.hoisted(() => ({
  account: {
    address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
    chainId: 314 as number | undefined,
  },
  invalidateAccountQueries: vi.fn(async () => undefined),
  nextHash: "0x0",
  submitFailure: undefined as unknown,
  usePublicClient: vi.fn(),
  writeContractAsync: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/utils/query-invalidation", () => ({
  invalidateAccountQueries: wagmi.invalidateAccountQueries,
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useWriteContract: () => ({ writeContractAsync: wagmi.writeContractAsync, isPending: false }),
  usePublicClient: wagmi.usePublicClient,
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => wagmi.account }));

type Hook = ReturnType<typeof useContractTransaction>;
type Options = Parameters<typeof useContractTransaction>[0];
const Probe = ({ onRender, options }: { onRender: (hook: Hook) => void; options: Options }) => {
  onRender(useContractTransaction(options));
  return null;
};

const mounted: ReturnType<typeof create>[] = [];
function mount(options: Options = { contractAddress: "0x1", abi: [] }) {
  let latest: Hook | undefined;
  act(() => {
    mounted.push(create(<Probe options={options} onRender={(hook) => (latest = hook)} />));
  });
  return () => latest as Hook;
}

const pinnedOptions = { account: ACCOUNT, abi: [], chainId: CHAIN_ID, contractAddress: CONTRACT };
const receipt = (hash: string, status: "success" | "reverted") =>
  ({ from: ACCOUNT, transactionHash: hash, status }) as unknown as TransactionReceipt;
const flush = () => act(async () => {});

describe("useContractTransaction", () => {
  beforeEach(() => {
    wagmi.account = { address: ACCOUNT, chainId: CHAIN_ID };
    wagmi.invalidateAccountQueries.mockClear();
    wagmi.nextHash = "0x0";
    wagmi.submitFailure = undefined;
    wagmi.usePublicClient.mockReset().mockReturnValue({
      waitForTransactionReceipt: ({ hash }: { hash: string }) =>
        new Promise<TransactionReceipt>((resolve) => receipts.set(hash, { resolve })),
    });
    wagmi.writeContractAsync.mockReset().mockImplementation(async () => {
      if (wagmi.submitFailure !== undefined) throw wagmi.submitFailure;
      return wagmi.nextHash;
    });
  });

  afterEach(() => {
    for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
    receipts.clear();
  });

  it("pins receipt polling to the transaction chain", () => {
    mount(pinnedOptions);
    expect(wagmi.usePublicClient).toHaveBeenCalledWith({ chainId: CHAIN_ID });
  });

  it("hands a submission failure to the caller as an Error whatever the wallet threw", async () => {
    const hook = mount();
    const onError = vi.fn();
    wagmi.submitFailure = "user rejected";

    await act(async () => {
      await expect(
        hook().execute({ functionName: "login", args: [], metadata: { type: "createSessionKey" }, onError }),
      ).rejects.toThrow("user rejected");
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("user rejected");
  });

  it("reports each receipt to the execute call that submitted it, in whatever order receipts land", async () => {
    const hook = mount();
    const a = { onConfirmed: vi.fn(), onReverted: vi.fn() };
    const b = { onConfirmed: vi.fn(), onReverted: vi.fn() };
    const metadata = { type: "createSessionKey" as const };

    wagmi.nextHash = "0xa";
    await act(async () => {
      await hook().execute({ functionName: "login", args: [], metadata, ...a });
    });
    wagmi.nextHash = "0xb";
    await act(async () => {
      await hook().execute({ functionName: "login", args: [], metadata, ...b });
    });
    expect(hook().isExecuting).toBe(true);

    receipts.get("0xb")?.resolve(receipt("0xb", "reverted"));
    await flush();
    expect(b.onReverted).toHaveBeenCalledTimes(1);
    expect(a.onConfirmed).not.toHaveBeenCalled();
    expect(a.onReverted).not.toHaveBeenCalled();

    receipts.get("0xa")?.resolve(receipt("0xa", "success"));
    await flush();
    expect(a.onConfirmed).toHaveBeenCalledTimes(1);
    expect(a.onConfirmed.mock.calls[0][0].transactionHash).toBe("0xa");
    expect(b.onConfirmed).not.toHaveBeenCalled();
    expect(hook().isExecuting).toBe(false);
  });

  it("rejects a write from a different network", async () => {
    const hook = mount(pinnedOptions);
    wagmi.account = { address: ACCOUNT, chainId: 314159 };

    await expect(
      hook().execute({ functionName: "depositWithPermit", args: [], metadata: { type: "deposit" } }),
    ).rejects.toThrow("connected network changed");
    expect(wagmi.writeContractAsync).not.toHaveBeenCalled();
  });

  it("rejects a write from a different account", async () => {
    const hook = mount(pinnedOptions);
    wagmi.account = { address: CONTRACT, chainId: CHAIN_ID };

    await expect(hook().execute({ functionName: "deposit", args: [], metadata: { type: "deposit" } })).rejects.toThrow(
      "connected wallet changed",
    );
    expect(wagmi.writeContractAsync).not.toHaveBeenCalled();
  });

  it("pins the intended account and chain on a valid write", async () => {
    const hook = mount(pinnedOptions);
    await hook().execute({ functionName: "deposit", args: [1n], metadata: { type: "deposit" } });

    expect(wagmi.writeContractAsync).toHaveBeenCalledWith({
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
    const hook = mount(pinnedOptions);
    wagmi.nextHash = "0xrefresh";

    await act(async () => {
      await hook().execute({ functionName: "deposit", args: [1n], metadata: { type: "deposit" } });
    });
    expect(wagmi.invalidateAccountQueries).not.toHaveBeenCalled();

    receipts.get("0xrefresh")?.resolve(receipt("0xrefresh", "success"));
    await flush();

    expect(wagmi.invalidateAccountQueries).toHaveBeenCalledOnce();
    expect(wagmi.invalidateAccountQueries).toHaveBeenCalledWith(expect.anything(), ACCOUNT);
  });
});
