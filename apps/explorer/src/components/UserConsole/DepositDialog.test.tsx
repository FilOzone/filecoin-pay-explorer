import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { mainnet } from "@/constants/chains";
import { DepositDialog } from "./DepositDialog";

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
const wallet = vi.hoisted(() => ({
  balance: { data: (3n * 10n ** 16n) as bigint | undefined, isError: false, isLoading: false },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  usePublicClient: () => ({}),
  useReadContract: () => wallet.balance,
  useReadContracts: () => ({ data: undefined, isError: false, isLoading: false }),
  useWalletClient: () => ({ data: {} }),
}));
vi.mock("@/components/UserConsole/DepositTokenPicker", () => ({
  default: () => null,
}));
vi.mock("@/components/UserConsole/FundsSection/components/RunwayCard", () => ({
  FundingRunwaySlider: () => null,
  RunwayCard: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useAccountSummary", () => ({ default: () => ({ data: undefined, isFetching: false }) }));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: vi.fn(), isExecuting: false }),
}));
const usdfc = {
  id: "user-token",
  token: { id: mainnet.contracts.usdfc.address, symbol: "USDFC", decimals: "18" },
} as never;

describe("DepositDialog", () => {
  it("rejects an amount above the connected wallet balance", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <DepositDialog depositToken={usdfc} network='mainnet' onOpenChange={vi.fn()} open tokens={[usdfc]} />,
      );
    });

    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("1"));

    const deposit = renderer.root.findAllByType("button").find((button) => button.children.join("") === "Deposit");
    expect(deposit?.props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("Insufficient wallet balance");
  });

  it("says why the deposit is blocked when the wallet balance cannot be read", () => {
    wallet.balance = { data: undefined, isError: true, isLoading: false };
    let renderer!: ReturnType<typeof create>;
    try {
      act(() => {
        renderer = create(
          <DepositDialog depositToken={usdfc} network='mainnet' onOpenChange={vi.fn()} open tokens={[usdfc]} />,
        );
      });
      act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("1"));

      const deposit = renderer.root.findAllByType("button").find((button) => button.children.join("") === "Deposit");
      expect(deposit?.props.disabled).toBe(true);
      expect(JSON.stringify(renderer.toJSON())).toContain("Wallet balance unavailable.");
    } finally {
      wallet.balance = { data: 3n * 10n ** 16n, isError: false, isLoading: false };
    }
  });
});
