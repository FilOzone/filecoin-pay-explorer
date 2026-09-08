import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@/test-utils/memory-storage";
import {
  type ExecuteSquidDepositInput,
  SquidDepositBudgetError,
  SquidDepositError,
} from "../data/squid-deposit-execution";
import { getPendingSquidDepositKey, type PendingSquidDeposit } from "../data/squid-deposit-tracker";
import { DirectSquidDepositDialog } from "./DirectSquidDepositDialog";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const USDC = "0x4444444444444444444444444444444444444444" as const;
const USDT = "0x5555555555555555555555555555555555555555" as const;
const ROUTE_HASH = `0x${"b".repeat(64)}` as const;

const state = vi.hoisted(() => ({
  estimateBudget: vi.fn(),
  execute: vi.fn(),
  liveRecipient: "0x2222222222222222222222222222222222222222" as `0x${string}` | undefined,
  refetchBalances: vi.fn(),
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
const topUp = vi.hoisted(() => ({ setActive: vi.fn() }));
const query = vi.hoisted(() => ({
  allowance: 100_000_000n,
  balanceIsError: false,
  budget: {
    maximum: 9_000_000_000_000n,
    transactions: [
      { kind: "approve" as const, fee: 3_000_000_000_000n },
      { kind: "route" as const, fee: 6_000_000_000_000n },
    ],
  },
  budgetIsError: false,
  inventory: {} as Record<string, bigint | null>,
  nativeBalance: 10n ** 18n,
  recipientFil: 0n,
  recipientFilIsError: false,
  recipientFilIsFetching: false,
  quoteEnabled: undefined as boolean | undefined,
  filGasTopUp: {
    deadline: 1_700_604_800n,
    minimumFil: 50_000_000_000_000_000n,
    spendUsdfc: 125_000_000_000_000_000n,
  },
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
  ] as { chainId: number; decimals: number; name: string; symbol: string; token: `0x${string}` }[],
}));
connectedWallets.current.push(wallet);

vi.mock("@privy-io/react-auth", () => ({ useWallets: () => ({ wallets: connectedWallets.current }) }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: state.liveRecipient }),
  usePublicClient: ({ chainId }: { chainId: number }) => ({ chain: { id: chainId } }),
}));
vi.mock("wagmi/actions", () => ({ getAccount: () => ({ address: state.liveRecipient }) }));
vi.mock("@/services/wagmi/config", () => ({ config: {} }));
vi.mock("../../TopUpActivityContext", () => ({
  useTopUpActivity: () => ({ setTopUpActive: topUp.setActive }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ enabled, queryKey }: { enabled?: boolean; queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "squid-payment-tokens") {
      return {
        data: query.tokens.filter((token) => token.chainId === queryKey[1]),
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      };
    }
    if (queryKey[0] === "squid" && queryKey[1] === "source-token-balances") {
      return { data: query.inventory, isPending: false };
    }
    if (queryKey[0] === "direct-squid-deposit-balances") {
      return {
        data: { allowance: query.allowance, native: query.nativeBalance, token: query.tokenBalance },
        isError: query.balanceIsError,
        refetch: state.refetchBalances,
      };
    }
    if (queryKey[0] === "direct-squid-deposit-gas-budget") {
      return {
        data: query.budgetIsError ? undefined : query.budget,
        isError: query.budgetIsError,
        isFetching: false,
        refetch: vi.fn(),
      };
    }
    if (queryKey[0] === "direct-squid-destination-fil") {
      return {
        data: query.recipientFil,
        isError: query.recipientFilIsError,
        isFetching: query.recipientFilIsFetching,
        isPending: false,
      };
    }
    if (queryKey[0] === "direct-squid-deposit-quote") {
      query.quoteEnabled = enabled;
      return {
        data: queryKey.at(-1) ? { ...query.quote, filGasTopUp: query.filGasTopUp } : query.quote,
        error: null,
        isFetching: false,
      };
    }
    return { data: query.quote, error: null, isFetching: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("../data/squid-deposit-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/squid-deposit-route")>();
  return {
    ...actual,
    estimateDepositNetworkFeeMaximum: state.estimateBudget,
    requestSquidDepositRoute: state.requestRoute,
  };
});
vi.mock("../data/squid-deposit-execution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/squid-deposit-execution")>();
  return { ...actual, executeSquidDeposit: state.execute };
});
vi.mock("@filecoin-foundation/ui-filecoin/Alert", () => ({
  Alert: ({ description, title }: { description: string; title: string }) => (
    <div role='status'>
      {title}: {description}
    </div>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Checkbox", () => ({
  Checkbox: ({ checked, id, onChange }: { checked: boolean; id: string; onChange: (checked: boolean) => void }) => (
    <input checked={checked} id={id} onChange={(event) => onChange(event.target.checked)} type='checkbox' />
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ onChange, ...props }: { onChange: (value: string) => void; value: string }) => (
    <input {...props} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@filecoin-pay/ui/components/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
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

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType("button")
    .find((candidate) => candidate.children.some((child) => String(child).includes(label)));
}

function amountInput(renderer: ReactTestRenderer) {
  return renderer.root.find((node) => node.type === "input" && node.props.id === "direct-squid-amount");
}

async function reachExecution(renderer: ReactTestRenderer) {
  await act(async () => {
    amountInput(renderer).props.onChange({ target: { value: "100" } });
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
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    listeners = {};
    storage = createMemoryStorage();
    state.liveRecipient = RECIPIENT;
    state.estimateBudget.mockReset().mockResolvedValue(query.budget);
    state.execute.mockReset();
    state.refetchBalances.mockReset().mockImplementation(async () => ({
      data: { allowance: query.allowance, native: query.nativeBalance, token: query.tokenBalance },
    }));
    state.requestRoute.mockReset().mockResolvedValue(query.quote);
    query.allowance = 100_000_000n;
    query.balanceIsError = false;
    query.budgetIsError = false;
    query.inventory = { [USDC.toLowerCase()]: 200_000_000n, [USDT.toLowerCase()]: 300_000_000n };
    query.nativeBalance = 10n ** 18n;
    query.recipientFil = 0n;
    query.recipientFilIsError = false;
    query.recipientFilIsFetching = false;
    query.tokenBalance = 200_000_000n;
    wallet.getEthereumProvider.mockClear();
    wallet.switchChain.mockClear();
    topUp.setActive.mockClear();
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

    expect(amountInput(renderer).props.value).toBe("12.5");
    expect(renderer.root.findByProps({ "aria-label": "Source token" }).props.value).toBe(USDC);
  });

  it("keeps the user's edits when a pending marker appears and clears", async () => {
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
    await act(async () => {
      amountInput(renderer).props.onChange({ target: { value: "100" } });
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
    storage.removeItem(getPendingSquidDepositKey(OWNER));
    await act(async () => {
      for (const listener of listeners.storage ?? []) listener({ key: getPendingSquidDepositKey(OWNER) });
    });

    expect(amountInput(renderer).props.value).toBe("100");
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
      amountInput(renderer).props.onChange({ target: { value: "10" } });
      renderer.update(render());
    });

    expect(amountInput(renderer).props.value).toBe("10");
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
      amountInput(renderer).props.onChange({ target: { value: "100" } });
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

  it("clears the selected token when the source network changes", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Source token" }).props.onChange({ target: { value: USDT } });
    });
    expect(renderer.root.findByProps({ "aria-label": "Source token" }).props.value).toBe(USDT);

    const sourceNetwork = renderer.root.findAll(
      (candidate) => candidate.props.value === "8453" && typeof candidate.props.onValueChange === "function",
    )[0];
    await act(async () => sourceNetwork.props.onValueChange("42161"));

    expect(renderer.root.findByProps({ "aria-label": "Source token" }).props.value).toBe("");
  });

  it("labels duplicate symbols with their address", async () => {
    const original = query.tokens;
    query.tokens = [...original, { ...original[0], token: OTHER }];
    try {
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
      });
      const labels = renderer.root.findAllByType("option").map((option) => option.children.join(""));
      expect(labels).toEqual(["USDC (0x4444...4444)", "USDT", "USDC (0x3333...3333)"]);
    } finally {
      query.tokens = original;
    }
  });

  it("keeps the selected token when a balance refresh reorders the list", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    const select = () => renderer.root.findByProps({ "aria-label": "Source token" });
    expect(select().props.value).toBe(USDC);
    expect(
      select()
        .findAllByType("option")
        .map((option) => option.props.value),
    ).toEqual([USDC, USDT]);

    query.inventory = { [USDC.toLowerCase()]: 0n, [USDT.toLowerCase()]: 300_000_000n };
    await act(async () => {
      renderer.update(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    expect(
      select()
        .findAllByType("option")
        .map((option) => option.props.value),
    ).toEqual([USDT, USDC]);
    expect(select().props.value).toBe(USDC);
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
      amountInput(renderer).props.onChange({ target: { value: "100" } });
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Balance: 200 USDC");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("The paying wallet does not have enough");
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
      amountInput(renderer).props.onChange({ target: { value: "100" } });
    });
    await act(async () => button(renderer, "Review")?.props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain(disclosure);
  });

  it.each([
    [0n, false, true, "Your wallet does not have enough FIL for fees."],
    [1n, false, true, "Your wallet does not have enough FIL for fees."],
    [250_000_000_000_000_000n, false, false, "You already have FIL for fees."],
    [0n, true, true, "Your wallet does not have enough FIL for fees."],
  ])("defaults the FIL option from destination balance %s (error: %s)", async (balance, isError, checked, hint) => {
    query.recipientFil = balance;
    query.recipientFilIsError = isError;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });

    const option = renderer.root.findByProps({ id: "direct-squid-fil-gas" });
    expect(option.props.checked).toBe(checked);
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("Include 0.05 FIL for transaction fees");
    expect(text).toContain(hint);
    expect(text).toContain("The FIL goes to your wallet to pay network fees, not to your Filecoin Pay balance.");
    expect(text.includes("+ 0.05 FIL for network fees")).toBe(checked);
  });

  it("waits for a fresh destination balance before defaulting from cached data", async () => {
    query.recipientFil = 0n;
    query.recipientFilIsFetching = true;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });

    await act(async () => {
      amountInput(renderer).props.onChange({ target: { value: "100" } });
    });
    expect(query.quoteEnabled).toBe(false);

    query.recipientFil = 250_000_000_000_000_000n;
    query.recipientFilIsFetching = false;
    await act(async () => {
      renderer.update(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });

    expect(renderer.root.findByProps({ id: "direct-squid-fil-gas" }).props.checked).toBe(false);
    expect(query.quoteEnabled).toBe(true);

    query.recipientFilIsFetching = true;
    await act(async () => {
      renderer.update(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    expect(query.quoteEnabled).toBe(true);
  });

  it("preserves the reviewed FIL plan through executable route construction", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);

    expect(state.requestRoute).toHaveBeenCalledWith(
      expect.objectContaining({ filGasTopUp: query.filGasTopUp }),
      expect.anything(),
      { quoteOnly: false },
    );
    const topUpLabel = renderer.root.findAllByType("span").find((node) => node.children.join("") === "Wallet top-up:");
    expect(topUpLabel?.parent?.children.slice(1).join("")).toContain("0.05 FIL");
  });

  it("lets the user opt out of the FIL top-up", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      renderer.root.findByProps({ id: "direct-squid-fil-gas" }).props.onChange(false);
    });
    await reachExecution(renderer);

    expect(state.requestRoute).toHaveBeenCalledWith(
      expect.not.objectContaining({ filGasTopUp: expect.anything() }),
      expect.anything(),
      { quoteOnly: false },
    );
  });

  it("reviews the live-estimated gas maximum and passes it to execution", async () => {
    query.allowance = 0n;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      amountInput(renderer).props.onChange({ target: { value: "100" } });
    });
    await act(async () => {
      button(renderer, "Review")?.props.onClick();
    });

    const gasLabel = renderer.root
      .findAllByType("span")
      .find((node) => node.children.join("") === "Network gas maximum:");
    const gasLine = gasLabel?.parent?.children.map((child) => (typeof child === "string" ? child : "")).join("");
    expect(gasLine).toContain("0.000009 ETH");
    expect(renderer.root.findAllByType("span").map((node) => node.children.join(""))).toContain(
      "Covers the approval and Squid transaction at current network fees plus 50% headroom.",
    );

    await act(async () => {
      button(renderer, "Pay 100 USDC")?.props.onClick();
      await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
    });
    expect(state.execute.mock.calls[0]?.[0]).toMatchObject({
      approvalRequired: true,
      approvalResetRequired: false,
      maxNativeFee: 9_000_000_000_000n,
    });
  });

  it("cannot review while the gas budget is unavailable", async () => {
    query.budgetIsError = true;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await act(async () => {
      amountInput(renderer).props.onChange({ target: { value: "100" } });
    });

    expect(button(renderer, "Review")?.props.disabled).toBe(true);
    expect(renderer.root.findAllByType("span").map((node) => node.children.join(""))).toContain(
      "Network fees could not be estimated.",
    );
  });

  it("re-reviews with a fresh maximum after the approval executed and the route breached the cap", async () => {
    query.allowance = 0n;
    state.execute.mockImplementationOnce(async () => {
      // The approval went through under the reviewed cap; the wallet now holds the exact allowance.
      query.allowance = 100_000_000n;
      throw new SquidDepositBudgetError({
        completed: ["approve"],
        next: "route",
        feeSoFar: 3_000_000_000_000n,
        nextFee: 8_000_000_000_000n,
        maxNativeFee: 9_000_000_000_000n,
      });
    });
    const freshBudget = {
      maximum: 12_000_000_000_000n,
      transactions: [{ kind: "route" as const, fee: 12_000_000_000_000n }],
    };
    state.estimateBudget.mockResolvedValueOnce(freshBudget);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);

    expect(state.estimateBudget).toHaveBeenCalledWith(
      expect.objectContaining({ allowance: 100_000_000n, sourceAmount: 100_000_000n, sourceToken: USDC }),
    );
    expect(renderer.root.findByProps({ role: "status" }).children.join("")).toBe(
      "Review the updated gas maximum: Network gas rose above the reviewed maximum before the Squid transaction. The approval already went through and will not be repeated. Check the updated maximum and confirm to send the Squid transaction.",
    );
    const gasLabel = renderer.root
      .findAllByType("span")
      .find((node) => node.children.join("") === "Network gas maximum:");
    expect(gasLabel?.parent?.children.map((child) => (typeof child === "string" ? child : "")).join("")).toContain(
      "0.000012 ETH",
    );
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    expect(button(renderer, "Pay 100 USDC")?.props.disabled).toBe(false);

    await act(async () => {
      button(renderer, "Pay 100 USDC")?.props.onClick();
      await vi.waitFor(() => expect(state.execute).toHaveBeenCalledTimes(2));
    });
    expect(state.execute.mock.calls[1]?.[0]).toMatchObject({
      approvalRequired: false,
      approvalResetRequired: false,
      maxNativeFee: 12_000_000_000_000n,
    });
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });

  it("keeps the dead end when the re-review itself cannot price the remaining transactions", async () => {
    state.execute.mockRejectedValueOnce(
      new SquidDepositBudgetError({ completed: [], next: "route", feeSoFar: 0n, nextFee: 1n, maxNativeFee: 0n }),
    );
    state.estimateBudget.mockRejectedValueOnce(new Error("Live network fee data is unavailable"));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);

    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toBe("Live network fee data is unavailable");
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });

  it("executes once when Pay is clicked twice", async () => {
    let finishExecution!: () => void;
    state.execute.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) => {
          finishExecution = () => reject(new Error("stopped"));
        }),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);

    await act(async () => {
      button(renderer, "Processing…")?.props.onClick();
    });
    expect(state.execute).toHaveBeenCalledOnce();
    expect(button(renderer, "Processing…")?.props.disabled).toBe(true);

    await act(async () => finishExecution());
  });

  it("keeps the route links visible when USDFC landed but the deposit step failed", async () => {
    state.execute.mockImplementationOnce(async (input: ExecuteSquidDepositInput) => {
      input.onSwapAttempt?.(5n);
      input.onBroadcast?.({ fundsBefore: 5n, transactionHash: ROUTE_HASH });
      throw new SquidDepositError(
        "USDFC reached your wallet but the Filecoin Pay deposit step failed.",
        "hook-failed",
        ROUTE_HASH,
      );
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);
    await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain("deposit step failed"));

    expect(storage.getItem(getPendingSquidDepositKey(OWNER))).not.toBeNull();
    expect(JSON.stringify(renderer.toJSON())).toContain("Squid route / add gas");
    expect(button(renderer, "Dismiss")).toBeDefined();
  });

  it("keeps NEEDS_GAS recoverable with the route link", async () => {
    state.execute.mockImplementationOnce(async (input: ExecuteSquidDepositInput) => {
      input.onSwapAttempt?.(5n);
      input.onBroadcast?.({ fundsBefore: 5n, transactionHash: ROUTE_HASH });
      throw new SquidDepositError("Add gas from the Squid route link, then check again.", "needs-gas", ROUTE_HASH);
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={vi.fn()} open />);
    });
    await reachExecution(renderer);
    await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain("Add gas from the Squid route link"));

    expect(storage.getItem(getPendingSquidDepositKey(OWNER))).not.toBeNull();
    expect(JSON.stringify(renderer.toJSON())).toContain("Squid route / add gas");
  });

  it("keeps top-up mode active until a successful route returns to Filecoin", async () => {
    state.execute.mockResolvedValueOnce({
      depositedAmount: 92n,
      fundsAfter: 97n,
      fundsBefore: 5n,
      transactionHash: ROUTE_HASH,
    });
    const onOpenChange = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DirectSquidDepositDialog accountId='account' onOpenChange={onOpenChange} open />);
    });
    await reachExecution(renderer);
    await vi.waitFor(() => expect(wallet.switchChain).toHaveBeenLastCalledWith(314));

    expect(wallet.switchChain.mock.calls).toEqual([[8453], [314]]);
    expect(topUp.setActive).toHaveBeenCalledWith(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await act(async () => {
      renderer.update(<DirectSquidDepositDialog accountId='account' onOpenChange={onOpenChange} open={false} />);
    });
    expect(topUp.setActive).toHaveBeenCalledWith(false);
  });
});
