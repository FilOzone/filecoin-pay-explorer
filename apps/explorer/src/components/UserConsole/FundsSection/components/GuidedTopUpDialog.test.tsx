import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginSquidAcquisition,
  hasSavedSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidBroadcast,
  markSquidSwapRequested,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { GuidedTopUpDialog } from "./GuidedTopUpDialog";

const wallet = vi.hoisted(() => ({
  address: undefined as `0x${string}` | undefined,
  chainId: 314 as number | undefined,
}));
const switchChainAsync = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined));
const dialog = vi.hoisted(() => ({ onOpenChange: undefined as ((open: boolean) => void) | undefined }));
const sdk = vi.hoisted(() => ({
  fundSync: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  synapse: undefined as { payments: { fundSync: ReturnType<typeof vi.fn> } } | undefined,
}));
const quoteReview = vi.hoisted(() => ({
  onAcquired: undefined as ((acquisition: SquidAcquisition) => void) | undefined,
  onNetworkSwitchingChange: undefined as ((isSwitching: boolean) => void) | undefined,
}));
const automaticRecovery = vi.hoisted(() => ({
  data: undefined as bigint | null | undefined,
  dataUpdatedAt: 0,
  error: null as Error | null,
  isEligible: false,
  isFetching: false,
  isPermanentError: false,
  refetch: vi.fn(),
}));
const lockManager = vi.hoisted(() => ({
  request: vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock) => unknown) =>
    callback({} as Lock),
  ),
}));

vi.mock("wagmi", () => ({
  useConnection: () => wallet,
  usePublicClient: () => undefined,
  useSwitchChain: () => ({ switchChainAsync }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: sdk.invalidateQueries }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { genesisTimestamp: 0 },
      contracts: { usdfc: "0x3333333333333333333333333333333333333333" },
    },
    synapse: sdk.synapse,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("../hooks/useSquidAcquisitionRecovery", () => ({
  useSquidAcquisitionRecovery: () => automaticRecovery,
}));
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

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: lockManager });
});

afterEach(() => {
  wallet.address = undefined;
  wallet.chainId = 314;
  sdk.synapse = undefined;
  automaticRecovery.data = undefined;
  automaticRecovery.dataUpdatedAt = 0;
  automaticRecovery.error = null;
  automaticRecovery.isEligible = false;
  automaticRecovery.isFetching = false;
  automaticRecovery.isPermanentError = false;
  automaticRecovery.refetch.mockReset();
  vi.unstubAllGlobals();
});
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

  it("deposits the frozen delivered balance increase instead of the reviewed minimum", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const owner = "0x1111111111111111111111111111111111111111" as const;
    const oneUsdfc = 10n ** 18n;
    const processing = beginSquidAcquisition(
      storage,
      owner,
      10n * oneUsdfc,
      100n * oneUsdfc,
      42161,
      "11111111-1111-4111-8111-111111111111",
    );
    const acquired = markSquidAcquired(
      storage,
      markSquidBroadcast(storage, markSquidSwapRequested(storage, processing), `0x${"3".repeat(64)}`),
      15n * oneUsdfc,
    );
    sdk.fundSync.mockImplementation(async ({ onHash }: { onHash: (hash: `0x${string}`) => void }) => {
      onHash(`0x${"4".repeat(64)}`);
      return { receipt: { status: "success" } };
    });
    sdk.synapse = { payments: { fundSync: sdk.fundSync } };
    vi.stubGlobal("window", { confirm: vi.fn(), localStorage: storage });
    wallet.address = owner;

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <GuidedTopUpDialog accountId='account' isAccountSummaryLoading={false} onOpenChange={vi.fn()} open />,
      );
    });
    const depositButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Deposit acquired USDFC"));
    expect(JSON.stringify(renderer.toJSON())).toContain('"15"');
    await act(async () => {
      await depositButton?.props.onClick();
    });

    expect(sdk.fundSync).toHaveBeenCalledWith(expect.objectContaining({ amount: 15n * oneUsdfc }));
    expect(loadSquidAcquisition(storage, acquired.owner)).toBeNull();
  });

  it("offers a confirmed recovery path for malformed saved state", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const owner = "0x1111111111111111111111111111111111111111" as const;
    storage.setItem(`filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`, "not json");
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(true), localStorage: storage });
    wallet.address = owner;

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <GuidedTopUpDialog accountId='account' isAccountSummaryLoading={false} onOpenChange={vi.fn()} open />,
      );
    });
    const clearButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Clear invalid saved acquisition"));
    expect(clearButton).toBeDefined();

    await act(async () => {
      await clearButton?.props.onClick();
    });
    expect(hasSavedSquidAcquisition(storage, owner)).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("invalid and must be cleared");
  });

  it("automatically continues with the verified delivered amount after refresh", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const owner = "0x1111111111111111111111111111111111111111" as const;
    const processing = markSquidBroadcast(
      storage,
      markSquidSwapRequested(
        storage,
        beginSquidAcquisition(
          storage,
          owner,
          10n * 10n ** 18n,
          100n * 10n ** 18n,
          42161,
          "11111111-1111-4111-8111-111111111111",
        ),
      ),
      `0x${"3".repeat(64)}`,
    );
    automaticRecovery.data = 15n * 10n ** 18n;
    automaticRecovery.dataUpdatedAt = 1;
    automaticRecovery.isEligible = true;
    vi.stubGlobal("window", { confirm: vi.fn(), localStorage: storage });
    wallet.address = owner;

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <GuidedTopUpDialog accountId='account' isAccountSummaryLoading={false} onOpenChange={vi.fn()} open={false} />,
      );
    });

    expect(loadSquidAcquisition(storage, processing.owner)).toEqual(
      expect.objectContaining({ deliveredAmount: 15n * 10n ** 18n, status: "acquired" }),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain('"15"');
    expect(JSON.stringify(renderer.toJSON())).not.toContain("USDFC arrived, continue to deposit");
  });
});
