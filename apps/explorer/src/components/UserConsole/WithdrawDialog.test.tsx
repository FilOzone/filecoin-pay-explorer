import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawDialog } from "./WithdrawDialog";

const mocks = vi.hoisted(() => ({
  accountInfo: [0n, 0n, 10n * 10n ** 18n, 0n] as [bigint, bigint, bigint, bigint] | undefined,
  execute: vi.fn(),
  isExecuting: false,
  dialogOnOpenChange: undefined as ((open: boolean) => void) | undefined,
  contentProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@filecoin-foundation/ui-filecoin/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
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
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  usePublicClient: () => ({}),
  useReadContract: () => ({ data: mocks.accountInfo, isLoading: false, isRefetching: false }),
  useWalletClient: () => ({ data: {} }),
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: mocks.isExecuting }),
}));

const userToken = {
  id: "user-token",
  token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18", name: "USDFC" },
} as never;

function renderDialog(onOpenChange = vi.fn()) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<WithdrawDialog network='mainnet' onOpenChange={onOpenChange} open userToken={userToken} />);
  });
  const withdraw = () =>
    renderer.root.findAllByType("button").find((button) => button.children.join("") === "Withdraw");
  const type = (value: string) => act(() => renderer.root.findByProps({ id: "amount" }).props.onChange(value));
  const text = () => JSON.stringify(renderer.toJSON());
  return { renderer, type, withdraw, text };
}

describe("WithdrawDialog", () => {
  beforeEach(() => {
    mocks.accountInfo = [0n, 0n, 10n * 10n ** 18n, 0n];
    mocks.execute.mockReset();
    mocks.isExecuting = false;
  });

  it("renders with an empty amount and enables withdrawal only for a valid amount within funds", () => {
    const { type, withdraw, text } = renderDialog();
    expect(withdraw()?.props.disabled).toBe(true);
    expect(text()).not.toContain("Insufficient Available funds");

    type("5");
    expect(withdraw()?.props.disabled).toBe(false);

    type("20");
    expect(withdraw()?.props.disabled).toBe(true);
    expect(text()).toContain("Insufficient Available funds");

    type("1e5");
    expect(withdraw()?.props.disabled).toBe(true);
  });

  it("withdraws the parsed amount", async () => {
    const { type, withdraw } = renderDialog();
    type("2.5");
    await act(async () => withdraw()?.props.onClick());

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "withdrawTo",
        args: [
          "0x3333333333333333333333333333333333333333",
          "0x1111111111111111111111111111111111111111",
          2_500_000_000_000_000_000n,
        ],
      }),
    );
  });

  it("refuses close requests while the wallet signature is pending, but not while the receipt is tracked", async () => {
    const onOpenChange = vi.fn();
    let submit!: () => void;
    mocks.execute.mockReturnValue(new Promise<void>((resolve) => (submit = resolve)));
    const { type, withdraw } = renderDialog(onOpenChange);
    type("1");
    let pending!: Promise<void>;
    act(() => {
      pending = withdraw()?.props.onClick();
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
    const { type, withdraw } = renderDialog(onOpenChange);
    type("1");
    await act(async () => withdraw()?.props.onClick());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
