import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteSquidDepositInput } from "../data/squid-deposit-execution";
import { getPendingSquidDepositKey, type PendingSquidDeposit } from "../data/squid-deposit-tracker";
import { DirectSquidDepositDialog } from "./DirectSquidDepositDialog";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const USDC = "0x4444444444444444444444444444444444444444" as const;
const USDT = "0x5555555555555555555555555555555555555555" as const;

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  liveRecipient: "0x2222222222222222222222222222222222222222" as `0x${string}` | undefined,
  requestRoute: vi.fn(),
}));
const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as const,
  getEthereumProvider: vi.fn(async () => ({
    request: vi.fn(async () => ["0x1111111111111111111111111111111111111111"]),
  })),
  switchChain: vi.fn(async () => undefined),
}));
const connectedWallets = vi.hoisted(() => ({
  current: [] as (typeof wallet)[],
}));
const query = vi.hoisted(() => ({
  allowance: 100_000_000n,
  balanceIsError: false,
  nativeBalance: 10n ** 18n,
  quote: {
    destinationAmount: 93n,
    fees: [],
    gasCosts: [],
    minimumDestinationAmount: 92n,
    quoteId: "quote-1",
    sourceAmount: 100_000_000n,
    sourceChainId: 8453,
    transaction: {
      data: "0xabcdef" as const,
      gasLimit: 100_000n,
      target: "0xCE16F69375520ab01377ce7B88f5BA8C48F8D666" as const,
      value: 0n,
    },
  },
  token: {
    chainId: 8453,
    decimals: 6,
    name: "USD Coin",
    symbol: "USDC",
    token: "0x4444444444444444444444444444444444444444" as const,
  },
  tokenBalance: 200_000_000n,
  tokens: [
    {
      chainId: 8453,
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
      token: "0x4444444444444444444444444444444444444444" as const,
    },
    {
      chainId: 8453,
      decimals: 6,
      name: "Tether",
      symbol: "USDT",
      token: "0x5555555555555555555555555555555555555555" as const,
    },
  ],
}));
connectedWallets.current.push(wallet);

vi.mock("@privy-io/react-auth", () => ({ useWallets: () => ({ wallets: connectedWallets.current }) }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: state.liveRecipient }),
  usePublicClient: ({ chainId }: { chainId: number }) => ({ chain: { id: chainId } }),
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => ({ address: state.liveRecipient }) }));
vi.mock("@/services/wagmi/config", () => ({ config: {} }));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "squid-payment-tokens") {
      return { data: query.tokens, isError: false, isPending: false, refetch: vi.fn() };
    }
    if (queryKey[0] === "squid" && queryKey[1] === "source-token-balances") {
      return { data: { [USDC.toLowerCase()]: 200_000_000n, [USDT.toLowerCase()]: 300_000_000n }, isPending: false };
    }
    if (queryKey[0] === "direct-squid-deposit-balances") {
      return {
        data: { allowance: query.allowance, native: query.nativeBalance, token: query.tokenBalance },
        isError: query.balanceIsError,
        refetch: vi.fn(),
      };
    }
    return { data: query.quote, error: null, isFetching: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("../data/squid-deposit-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/squid-deposit-route")>();
  return { ...actual, requestSquidDepositRoute: state.requestRoute };
});
vi.mock("../data/squid-deposit-execution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/squid-deposit-execution")>();
  return { ...actual, executeSquidDeposit: state.execute };
});
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
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./SearchableSelect", () => ({
  SearchableSelect: ({
    onValueChange,
    options,
    value,
  }: {
    onValueChange: (value: string) => void;
    options: { label: string; value: string }[];
    value: string;
  }) => (
    <select aria-label='Source token' onChange={(event) => onValueChange(event.target.value)} value={value}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType("button")
    .find((candidate) => candidate.children.some((child) => String(child).includes(label)));
}

async function reachExecution(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.root.findByType("input").props.onChange({ target: { value: "100" } });
  });
  await act(async () => {
    button(renderer, "Review")?.props.onClick();
  });
  await act(async () => {
    button(renderer, "Pay 100 USDC")?.props.onClick();
    await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
  });
}

describe("DirectSquidDepositDialog safety integration", () => {
  let listeners: Record<string, ((event: { key?: string | null }) => void)[]>;
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    listeners = {};
    storage = memoryStorage();
    state.liveRecipient = RECIPIENT;
    state.execute.mockReset();
    state.requestRoute.mockReset().mockResolvedValue(query.quote);
    query.allowance = 100_000_000n;
    query.balanceIsError = false;
    query.nativeBalance = 10n ** 18n;
    query.tokenBalance = 200_000_000n;
    wallet.getEthereumProvider.mockClear();
    wallet.switchChain.mockClear();
    vi.stubGlobal("navigator", {
      locks: {
        request: vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
          callback({} as Lock),
        ),
      },
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, listener: (event: { key?: string | null }) => void) => {
        listeners[type] = [...(listeners[type] ?? []), listener];
      }),
      confirm: vi.fn(),
      dispatchEvent: vi.fn(),
      localStorage: storage,
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefills the verified purchased source token and amount", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DirectSquidDepositDialog
          accountId={RECIPIENT.toLowerCase()}
          initialSource={{ amount: 12_500_000n, chainId: 8453, decimals: 6, token: USDC }}
          onOpenChange={() => undefined}
          open
        />,
      );
    });

    expect(renderer.root.findByType("input").props.value).toBe("12.5");
    expect(renderer.root.findByProps({ "aria-label": "Source token" }).props.value).toBe(USDC);
  });

  it("does not reapply an equivalent purchase prefill after the user edits it", async () => {
    let renderer!: ReactTestRenderer;
    const render = () => (
      <DirectSquidDepositDialog
        accountId={RECIPIENT.toLowerCase()}
        initialSource={{ amount: 12_500_000n, chainId: 8453, decimals: 6, token: USDC }}
        onOpenChange={() => undefined}
        open
      />
    );
    await act(async () => {
      renderer = create(render());
    });
    await act(async () => {
      renderer.root.findByType("input").props.onChange({ target: { value: "10" } });
      renderer.update(render());
    });

    expect(renderer.root.findByType("input").props.value).toBe("10");
  });

  it.each([
    "destination account switch",
    "dialog unmount",
  ])("invalidates the reviewed context before a source send on %s", async (change) => {
    let continueExecution!: () => void;
    const paused = new Promise<void>((resolve) => {
      continueExecution = resolve;
    });
    let contextError: unknown;
    state.execute.mockImplementationOnce(async (input: ExecuteSquidDepositInput) => {
      await paused;
      try {
        input.assertCurrentContext();
      } catch (error) {
        contextError = error;
        throw error;
      }
      throw new Error("expected reviewed context invalidation");
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);

    if (change === "dialog unmount") {
      await act(async () => renderer.unmount());
    } else {
      state.liveRecipient = OTHER;
    }
    await act(async () => {
      continueExecution();
      await vi.waitFor(() => expect(contextError).toBeInstanceOf(Error));
    });
    expect(contextError).toMatchObject({ message: expect.stringContaining("Funding details changed after review") });
  });

  it("renders another tab's pending marker immediately after its storage event", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    const pending: PendingSquidDeposit = {
      executionStage: "swap-requested",
      fundsBefore: 5n,
      minimumDestinationAmount: 92n,
      owner: OWNER,
      quoteId: "quote-1",
      recipient: RECIPIENT,
      sourceAmount: 100_000_000n,
      sourceChainId: 8453,
      sourceToken: USDC,
      startedAt: 1_700_000_000_000,
    };
    storage.setItem(
      getPendingSquidDepositKey(OWNER),
      JSON.stringify({
        ...pending,
        fundsBefore: pending.fundsBefore.toString(),
        minimumDestinationAmount: pending.minimumDestinationAmount.toString(),
        sourceAmount: pending.sourceAmount.toString(),
      }),
    );

    await act(async () => {
      for (const listener of listeners.storage ?? []) listener({ key: getPendingSquidDepositKey(OWNER) });
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("Your wallet may have submitted this route");
    expect(button(renderer, "Pay 100 USDC")).toBeUndefined();
  });

  it("uses the explicitly selected token as the reviewed and executed source", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Source token" }).props.onChange({ target: { value: USDT } });
      renderer.root.findByType("input").props.onChange({ target: { value: "100" } });
    });
    await act(async () => button(renderer, "Review")?.props.onClick());
    await act(async () => {
      button(renderer, "Pay 100 USDT")?.props.onClick();
      await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
    });
    expect(state.requestRoute).toHaveBeenCalledWith(expect.objectContaining({ sourceToken: USDT }), expect.anything(), {
      quoteOnly: false,
    });
    expect(state.execute.mock.calls[0][0].request.sourceToken).toBe(USDT);
  });

  it("does not display or review retained balances after a refresh error", async () => {
    query.balanceIsError = true;
    query.nativeBalance = 0n;
    query.tokenBalance = 1n;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      renderer.root.findByType("input").props.onChange({ target: { value: "100" } });
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Balance: 200 USDC");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("does not have enough");
    expect(button(renderer, "Review")?.props.disabled).toBe(true);
  });

  it.each([
    [0n, "an approval, then the Squid transaction"],
    [1n, "an allowance reset, an approval, then the Squid transaction"],
  ])("discloses the reviewed approval path for allowance %s", async (allowance, disclosure) => {
    query.allowance = allowance;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      renderer.root.findByType("input").props.onChange({ target: { value: "100" } });
    });
    await act(async () => button(renderer, "Review")?.props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain(disclosure);
  });
});
