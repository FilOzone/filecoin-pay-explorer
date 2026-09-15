import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPermitDomainSeparator } from "@/utils/permit";
import { CUSTOM_OPTION, useAddServiceSubmit, useTokenSelection } from "./hooks";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const PAYMENTS = "0x3333333333333333333333333333333333333333" as const;
const OPERATOR = "0x4444444444444444444444444444444444444444" as const;
const CHAIN_ID = 314159;

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getPermitSignature: vi.fn(),
  readContracts: [] as Array<{ status: "success"; result: unknown }>,
  isExecuting: false,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: OWNER }),
  usePublicClient: () => ({ readContract: vi.fn() }),
  useReadContract: () => ({ data: 1000n, isLoading: false }),
  useReadContracts: () => ({ data: mocks.readContracts, isLoading: false, isError: false }),
  useWalletClient: () => ({ data: { signTypedData: vi.fn() } }),
}));
vi.mock("@/hooks/useApprovableServices", () => ({ useApprovableServices: () => ({ services: [], isLoading: false }) }));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: mocks.isExecuting }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { id: CHAIN_ID, slug: "calibration", blockExplorers: { default: { url: "https://example.com" } } },
      contracts: { payments: { address: PAYMENTS, abi: [] } },
    },
  }),
}));
vi.mock("@/utils/permit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/permit")>()),
  getPermitSignature: mocks.getPermitSignature,
}));

beforeEach(() => {
  mocks.execute.mockReset().mockResolvedValue(undefined);
  mocks.getPermitSignature.mockReset().mockResolvedValue({
    deadline: 123n,
    v: 27,
    r: "0xaaaa",
    s: "0xbbbb",
  });
  mocks.isExecuting = false;
  mocks.readContracts = [];
});

describe("useTokenSelection", () => {
  it("accepts a custom permit token only when its onchain domain separator matches", () => {
    mocks.readContracts = [
      { status: "success", result: "TKN" },
      { status: "success", result: 18 },
      { status: "success", result: "Token Name" },
      { status: "success", result: 0n },
      { status: "success", result: getPermitDomainSeparator(TOKEN, "Token Name", CHAIN_ID) },
    ];
    let selection!: ReturnType<typeof useTokenSelection>;
    function Harness() {
      selection = useTokenSelection(true);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness />);
    });
    act(() => selection.setTokenChoice(CUSTOM_OPTION));
    act(() => selection.setCustomTokenInput(TOKEN));
    expect(selection.supportsPermit).toBe(true);

    mocks.readContracts = mocks.readContracts.map((read, index) =>
      index === 4 ? { ...read, result: `0x${"00".repeat(32)}` } : read,
    );
    act(() => renderer.update(<Harness />));
    expect(selection.token?.name).toBe("Token Name");
    expect(selection.supportsPermit).toBe(false);
  });
});

describe("useAddServiceSubmit", () => {
  function renderSubmitHook(onSubmitOnChain = vi.fn()) {
    let result!: ReturnType<typeof useAddServiceSubmit>;
    function Harness() {
      result = useAddServiceSubmit(onSubmitOnChain);
      return null;
    }
    act(() => {
      create(<Harness />);
    });
    return {
      get result() {
        return result;
      },
      onSubmitOnChain,
    };
  }

  it("keeps the dialog busy while the permit signature is pending, then submits the combined call", async () => {
    let resolvePermit!: (signature: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` }) => void;
    mocks.getPermitSignature.mockReturnValue(
      new Promise((resolve) => {
        resolvePermit = resolve;
      }),
    );
    const hook = renderSubmitHook();
    const args = {
      operatorAddress: OPERATOR,
      token: { address: TOKEN, symbol: "TKN", decimals: 18, name: "Token Name" },
      parsedDeposit: 25n,
      depositAmountLabel: "25",
      lockupInWei: 5n,
      rateInWei: 6n,
    };
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.submit(args);
    });
    expect(hook.result.isSubmitting).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();

    await act(async () => {
      resolvePermit({ deadline: 123n, v: 27, r: "0xaaaa", s: "0xbbbb" });
      await pending;
    });

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
      metadata: { type: "depositAndApprove", amount: "25", token: "TKN", operator: OPERATOR },
      onSubmitOnChain: hook.onSubmitOnChain,
    });
    expect(hook.result.isSubmitting).toBe(false);
  });

  it("uses approval-only submission when no deposit is requested", async () => {
    const hook = renderSubmitHook();
    await act(() =>
      hook.result.submit({
        operatorAddress: OPERATOR,
        token: { address: TOKEN, symbol: "TKN", decimals: 18 },
        parsedDeposit: null,
        depositAmountLabel: "",
        lockupInWei: 5n,
        rateInWei: 6n,
      }),
    );

    expect(mocks.getPermitSignature).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith({
      functionName: "setOperatorApproval",
      args: [TOKEN, OPERATOR, true, 6n, 5n, 86_400n],
      metadata: { type: "approveOperator", operator: OPERATOR, token: "TKN" },
      onSubmitOnChain: hook.onSubmitOnChain,
    });
  });
});
