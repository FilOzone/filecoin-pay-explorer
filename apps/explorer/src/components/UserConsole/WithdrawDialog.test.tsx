import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawDialog } from "./WithdrawDialog";

const mocks = vi.hoisted(() => ({
  accountInfo: [0n, 0n, 10n * 10n ** 18n, 0n] as [bigint, bigint, bigint, bigint] | undefined,
  execute: vi.fn(),
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
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
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
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: false }),
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

const userToken = {
  id: "user-token",
  token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18", name: "USDFC" },
} as never;

function renderDialog() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<WithdrawDialog onOpenChange={vi.fn()} open userToken={userToken} />);
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
});
