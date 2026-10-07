import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncreaseApprovalDialog } from "./IncreaseApprovalDialog";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  isExecuting: false,
  dialogOnOpenChange: undefined as ((open: boolean) => void) | undefined,
  contentProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@filecoin-foundation/ui-filecoin/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button {...props} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ onChange, ...props }: { onChange: (value: string) => void; value: string }) => (
    <input {...props} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
    mocks.dialogOnOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => {
    mocks.contentProps = props;
    return children;
  },
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }) }));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: mocks.isExecuting }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    synapse: {},
    constants: {
      chain: { id: 314, blockExplorers: { default: { url: "https://example.com" } } },
      contracts: { payments: { address: "0x2222222222222222222222222222222222222222", abi: [] } },
    },
  }),
}));

const approvalFixture = {
  token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
  operator: { address: "0x4444444444444444444444444444444444444444" },
  lockupAllowance: "100",
  rateAllowance: "10",
  maxLockupPeriod: "50",
};
const approval = approvalFixture as never;

function renderDialog(onOpenChange = vi.fn()) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<IncreaseApprovalDialog approval={approval} open onOpenChange={onOpenChange} />);
  });
  const increase = () => renderer.root.findAllByType("button").find((b) => b.children.join("") === "Increase");
  const type = (id: string, value: string) => act(() => renderer.root.findByProps({ id }).props.onChange(value));
  return { increase, type };
}

describe("IncreaseApprovalDialog", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.isExecuting = false;
  });

  it.each([
    ["an exponent lockup", "lockupIncrease", "1e5"],
    ["a decimal maximum lockup period", "maxLockupPeriodIncrease", "1.5"],
  ])("disables Increase for %s instead of getting stuck", async (_name, id, value) => {
    const { increase, type } = renderDialog();
    type("lockupIncrease", "1");
    expect(increase()?.props.disabled).toBe(false);

    type(id, value);
    expect(increase()?.props.disabled).toBe(true);
    await act(async () => increase()?.props.onClick());
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("submits the summed allowances", async () => {
    const { increase, type } = renderDialog();
    type("lockupIncrease", "1");
    type("maxLockupPeriodIncrease", "5");
    await act(async () => increase()?.props.onClick());

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [approvalFixture.token.id, approvalFixture.operator.address, true, 10n, 100n + 10n ** 18n, 55n],
      }),
    );
  });

  it("resets after a failed submission", async () => {
    mocks.execute.mockRejectedValue(new Error("rejected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { increase, type } = renderDialog();
    type("lockupIncrease", "1");
    await act(async () => increase()?.props.onClick());
    expect(increase()?.props.disabled).toBe(false);
  });

  it("refuses close requests while the wallet signature is pending, but not while the receipt is tracked", async () => {
    const onOpenChange = vi.fn();
    let submit!: () => void;
    mocks.execute.mockReturnValue(new Promise<void>((resolve) => (submit = resolve)));
    const { increase, type } = renderDialog(onOpenChange);
    type("lockupIncrease", "1");
    let pending!: Promise<void>;
    act(() => {
      pending = increase()?.props.onClick();
    });

    act(() => mocks.dialogOnOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.contentProps?.showCloseButton).toBe(false);

    // Submitted: execute resolves while the receipt is still being tracked.
    mocks.isExecuting = true;
    await act(async () => {
      submit();
      await pending;
    });
    expect(mocks.contentProps?.showCloseButton).toBe(true);
    act(() => mocks.dialogOnOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes deliberately once the transaction is submitted on chain", async () => {
    const onOpenChange = vi.fn();
    mocks.execute.mockImplementation(async ({ onSubmitOnChain }) => onSubmitOnChain());
    const { increase, type } = renderDialog(onOpenChange);
    type("lockupIncrease", "1");
    await act(async () => increase()?.props.onClick());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
