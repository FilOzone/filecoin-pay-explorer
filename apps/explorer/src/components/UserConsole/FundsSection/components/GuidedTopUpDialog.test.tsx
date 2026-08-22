import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { GuidedTopUpDialog } from "./GuidedTopUpDialog";

const wallet = vi.hoisted(() => ({ chainId: 314 as number | undefined }));
const switchChainAsync = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined));
const dialog = vi.hoisted(() => ({ onOpenChange: undefined as ((open: boolean) => void) | undefined }));
const quoteReview = vi.hoisted(() => ({
  onAcquired: undefined as
    | ((acquisition: {
        destinationAmount: bigint;
        owner: `0x${string}`;
        sourceChainId: number;
        status: "acquired";
        transactionHashes: `0x${string}`[];
      }) => void)
    | undefined,
  onNetworkSwitchingChange: undefined as ((isSwitching: boolean) => void) | undefined,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: undefined, chainId: wallet.chainId }),
  useSwitchChain: () => ({ switchChainAsync }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { chain: { genesisTimestamp: 0 } }, synapse: undefined }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({ Input: () => <input /> }));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
    dialog.onOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./RunwayCard", () => ({
  FundingRunwaySlider: () => null,
  RunwayCard: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./SquidQuoteReview", () => ({
  SquidQuoteReview: ({
    onAcquired,
    onNetworkSwitchingChange,
  }: {
    onAcquired: NonNullable<typeof quoteReview.onAcquired>;
    onNetworkSwitchingChange: (isSwitching: boolean) => void;
  }) => {
    quoteReview.onAcquired = onAcquired;
    quoteReview.onNetworkSwitchingChange = onNetworkSwitchingChange;
    return null;
  },
}));

describe("GuidedTopUpDialog", () => {
  it("restores the wallet network captured when the dialog opened", async () => {
    const onOpenChange = vi.fn();
    const props = {
      accountId: "account",
      isAccountSummaryLoading: false,
      onOpenChange,
      open: true,
    };
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<GuidedTopUpDialog {...props} />);
    });
    await act(async () => {
      quoteReview.onNetworkSwitchingChange?.(true);
    });
    await act(async () => {
      dialog.onOpenChange?.(false);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      quoteReview.onNetworkSwitchingChange?.(false);
    });
    wallet.chainId = 8453;
    await act(async () => {
      renderer.update(<GuidedTopUpDialog {...props} />);
    });
    await act(async () => {
      dialog.onOpenChange?.(false);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 314 });
  });

  it("keeps the dialog open until the Filecoin network switch settles", async () => {
    const onOpenChange = vi.fn();
    const props = {
      accountId: "account",
      isAccountSummaryLoading: false,
      onOpenChange,
      open: true,
    };
    let resolveSwitch!: () => void;
    switchChainAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    wallet.chainId = 314;
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<GuidedTopUpDialog {...props} />);
    });
    wallet.chainId = 8453;
    await act(async () => {
      renderer.update(<GuidedTopUpDialog {...props} />);
      quoteReview.onAcquired?.({
        destinationAmount: 1n,
        owner: "0x0000000000000000000000000000000000000001",
        sourceChainId: 8453,
        status: "acquired",
        transactionHashes: [],
      });
    });
    const switchButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Switch to Filecoin to deposit"));
    expect(switchButton).toBeDefined();

    await act(async () => {
      void switchButton?.props.onClick();
    });
    expect(switchButton?.props.disabled).toBe(true);
    await act(async () => {
      dialog.onOpenChange?.(false);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    wallet.chainId = 314;
    await act(async () => {
      renderer.update(<GuidedTopUpDialog {...props} />);
    });
    const depositButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Deposit acquired USDFC"));
    expect(depositButton?.props.disabled).toBe(true);

    await act(async () => {
      resolveSwitch();
    });
    await act(async () => {
      dialog.onOpenChange?.(false);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
