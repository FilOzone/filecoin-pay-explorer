import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddServiceLifecycle } from "./useAddServiceLifecycle";

const OPERATOR = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const PAYMENTS = "0x3333333333333333333333333333333333333333" as const;
const OWNER = "0x4444444444444444444444444444444444444444" as const;
const OTHER_OWNER = "0x5555555555555555555555555555555555555555" as const;
const CHAIN_ID = 314159;
const OTHER_CHAIN_ID = 314;
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

const mocks = vi.hoisted(() => ({
  account: { address: "0x4444444444444444444444444444444444444444" as `0x${string}` | undefined },
  chainId: 314159,
  execute: vi.fn(),
  getPermitSignature: vi.fn(),
  contractTransactionOptions: undefined as Record<string, unknown> | undefined,
  publicClientOptions: undefined as Record<string, unknown> | undefined,
  indexedTransactionOptions: undefined as Record<string, unknown> | undefined,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.account.address }),
  usePublicClient: (options: Record<string, unknown>) => {
    mocks.publicClientOptions = options;
    return { readContract: vi.fn() };
  },
  useWalletClient: () => ({ data: { signTypedData: vi.fn() } }),
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: (options: Record<string, unknown>) => {
    mocks.contractTransactionOptions = options;
    return { execute: mocks.execute };
  },
}));
vi.mock("@/hooks/useIndexedTransaction", () => ({
  useIndexedTransaction: (options: Record<string, unknown>) => {
    mocks.indexedTransactionOptions = options;
    return {
      stage: "review",
      txHash: undefined,
      error: undefined,
      resumedContext: null,
      indexingTimedOut: false,
      submit: async (_context: unknown, broadcast: () => Promise<unknown>) => {
        await broadcast();
      },
      recheckIndexing: vi.fn(),
      reset: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/useGraphQLQuery", () => ({ useGraphQLClient: () => ({ executeQuery: vi.fn() }) }));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { id: mocks.chainId, slug: "calibration", blockExplorers: { default: { url: "https://example.com" } } },
      contracts: { payments: { address: PAYMENTS, abi: [] } },
    },
  }),
}));
vi.mock("@/utils/permit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/permit")>()),
  getPermitSignature: mocks.getPermitSignature,
}));

function renderLifecycleHook() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useAddServiceLifecycle>;
  function Harness() {
    result = useAddServiceLifecycle();
    return null;
  }
  const makeElement = () => (
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(makeElement());
  });
  return {
    get result() {
      return result;
    },
    rerender: () => act(() => renderer.update(makeElement())),
  };
}

beforeEach(() => {
  mocks.account = { address: OWNER };
  mocks.chainId = CHAIN_ID;
  mocks.execute.mockReset().mockResolvedValue(HASH);
  mocks.getPermitSignature.mockReset().mockResolvedValue({ deadline: 123n, v: 27, r: "0xaaaa", s: "0xbbbb" });
  mocks.contractTransactionOptions = undefined;
  mocks.publicClientOptions = undefined;
  mocks.indexedTransactionOptions = undefined;
});

describe("useAddServiceLifecycle", () => {
  it("binds the transaction helper and public client reads to the selected Filecoin chain", () => {
    renderLifecycleHook();
    expect(mocks.contractTransactionOptions).toMatchObject({ chainId: CHAIN_ID, contractAddress: PAYMENTS });
    expect(mocks.publicClientOptions).toEqual({ chainId: CHAIN_ID });
    expect(mocks.indexedTransactionOptions).toMatchObject({ owner: OWNER, chainId: CHAIN_ID });
  });

  it("submits a plain approval without a permit signature when no deposit is requested", async () => {
    const hook = renderLifecycleHook();
    await act(() =>
      hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18 },
        parsedDeposit: null,
        lockupInWei: 5n,
        rateInWei: 6n,
      }),
    );

    expect(mocks.getPermitSignature).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith({
      functionName: "setOperatorApproval",
      args: [TOKEN, OPERATOR, true, 6n, 5n, 86_400n],
      metadata: { type: "approveOperator", operator: OPERATOR, token: "TKN" },
    });
  });

  it("signs a permit on the selected chain, then broadcasts the combined deposit-and-approve call", async () => {
    const hook = renderLifecycleHook();
    await act(() =>
      hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18, name: "Token Name" },
        parsedDeposit: 25n,
        lockupInWei: 5n,
        rateInWei: 6n,
      }),
    );

    expect(mocks.getPermitSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAddress: TOKEN,
        tokenName: "Token Name",
        ownerAddress: OWNER,
        spenderAddress: PAYMENTS,
        amount: 25n,
        chainId: CHAIN_ID,
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.execute).toHaveBeenCalledWith({
      functionName: "depositWithPermitAndApproveOperator",
      args: [TOKEN, OWNER, 25n, 123n, 27, "0xaaaa", "0xbbbb", OPERATOR, 6n, 5n, 86_400n],
      metadata: { type: "depositAndApprove", amount: "0.000000000000000025", token: "TKN", operator: OPERATOR },
    });
  });

  it("rejects without broadcasting when the wallet account changes while the permit signature is pending", async () => {
    let resolvePermit!: (signature: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` }) => void;
    mocks.getPermitSignature.mockReturnValue(
      new Promise((resolve) => {
        resolvePermit = resolve;
      }),
    );
    const hook = renderLifecycleHook();

    let submission!: Promise<void>;
    act(() => {
      submission = hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18, name: "Token Name" },
        parsedDeposit: 25n,
        lockupInWei: 5n,
        rateInWei: 6n,
      });
    });

    // The wallet's active account changes mid-signature.
    mocks.account = { address: OTHER_OWNER };
    hook.rerender();

    await expect(
      act(async () => {
        resolvePermit({ deadline: 123n, v: 27, r: "0xaaaa", s: "0xbbbb" });
        await submission;
      }),
    ).rejects.toThrow(/account or network changed/i);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects without broadcasting when the wallet's chain changes while the permit signature is pending", async () => {
    let resolvePermit!: (signature: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` }) => void;
    mocks.getPermitSignature.mockReturnValue(
      new Promise((resolve) => {
        resolvePermit = resolve;
      }),
    );
    const hook = renderLifecycleHook();

    let submission!: Promise<void>;
    act(() => {
      submission = hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18, name: "Token Name" },
        parsedDeposit: 25n,
        lockupInWei: 5n,
        rateInWei: 6n,
      });
    });

    mocks.chainId = OTHER_CHAIN_ID;
    hook.rerender();

    await expect(
      act(async () => {
        resolvePermit({ deadline: 123n, v: 27, r: "0xaaaa", s: "0xbbbb" });
        await submission;
      }),
    ).rejects.toThrow(/account or network changed/i);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("surfaces a clear error when the permit signature is declined or unsupported", async () => {
    mocks.getPermitSignature.mockRejectedValue(new Error("User rejected the request"));
    const hook = renderLifecycleHook();

    await expect(
      hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18, name: "Token Name" },
        parsedDeposit: 25n,
        lockupInWei: 5n,
        rateInWei: 6n,
      }),
    ).rejects.toThrow("User rejected the request");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
