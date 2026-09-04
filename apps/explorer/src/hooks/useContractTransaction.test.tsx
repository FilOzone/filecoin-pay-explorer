import { act, create } from "react-test-renderer";
import type { TransactionReceipt } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContractTransaction } from "./useContractTransaction";

vi.mock("sonner", () => ({ toast: { loading: vi.fn(() => "toast-id"), success: vi.fn(), error: vi.fn() } }));

// One deferred receipt per hash, resolved by the test in whatever order it wants.
const receipts = new Map<string, { resolve: (r: TransactionReceipt) => void }>();
const wagmi = vi.hoisted(() => ({ nextHash: "0x0" }));
vi.mock("wagmi", () => ({
  useWriteContract: () => ({ writeContractAsync: async () => wagmi.nextHash, isPending: false }),
  usePublicClient: () => ({
    waitForTransactionReceipt: ({ hash }: { hash: string }) =>
      new Promise<TransactionReceipt>((resolve) => receipts.set(hash, { resolve })),
  }),
}));

type Hook = ReturnType<typeof useContractTransaction>;
const Probe = ({ onRender }: { onRender: (hook: Hook) => void }) => {
  onRender(useContractTransaction({ contractAddress: "0x1", abi: [] }));
  return null;
};

const mounted: ReturnType<typeof create>[] = [];
function mount() {
  let latest: Hook | undefined;
  act(() => {
    mounted.push(create(<Probe onRender={(hook) => (latest = hook)} />));
  });
  return () => latest as Hook;
}

const receipt = (hash: string, status: "success" | "reverted") =>
  ({ transactionHash: hash, status }) as TransactionReceipt;
const flush = () => act(async () => {});

describe("useContractTransaction", () => {
  afterEach(() => {
    for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
    receipts.clear();
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
});
