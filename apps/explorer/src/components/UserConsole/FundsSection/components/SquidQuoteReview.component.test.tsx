import { NATIVE_TOKEN_ADDRESS, type SquidFundingPlan } from "@filecoin-project/squid-evm-funding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAddress } from "@/utils/formatter";
import { sourceTokenBalancesQueryKey } from "../data/source-token-balances";
import type { SearchableOption } from "./SearchableSelect";
import { SquidQuoteReview } from "./SquidQuoteReview";

const ownerA = "0x1111111111111111111111111111111111111111" as const;
const ownerB = "0x2222222222222222222222222222222222222222" as const;
const usdc = {
  chainId: 8453,
  decimals: 6,
  symbol: "USDC",
  token: "0x3333333333333333333333333333333333333333" as const,
};
const usdt = {
  chainId: 8453,
  decimals: 6,
  symbol: "USDT",
  token: "0x4444444444444444444444444444444444444444" as const,
};
const opToken = {
  chainId: 10,
  decimals: 18,
  symbol: "OP",
  token: "0x5555555555555555555555555555555555555555" as const,
};

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
  chainId: 8453,
}));
const controls = vi.hoisted(() => ({
  selectNetwork: undefined as ((value: string) => void) | undefined,
  token: undefined as
    | {
        onValueChange: (value: string) => void;
        options: readonly SearchableOption[];
        value: string;
      }
    | undefined,
}));
const fetchSourceTokens = vi.hoisted(() => vi.fn());
const planSquidTopUp = vi.hoisted(() => vi.fn());
const readSourceTokenBalances = vi.hoisted(() => vi.fn());
const switchChainAsync = vi.hoisted(() => vi.fn());
const publicClient = vi.hoisted(() => ({
  getBalance: vi.fn().mockResolvedValue(100n),
  multicall: vi.fn(),
  readContract: vi.fn().mockResolvedValue(1_000_000n),
}));

vi.mock("@filecoin-project/squid-evm-funding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@filecoin-project/squid-evm-funding")>()),
  fetchSourceTokens,
}));
vi.mock("../data/source-token-balances", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/source-token-balances")>()),
  readSourceTokenBalances,
}));
vi.mock("../data/squid-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/squid-quote")>()),
  planSquidTopUp,
}));
vi.mock("use-debounce", () => ({ useDebounce: <T,>(value: T) => [value] }));
vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  usePublicClient: () => publicClient,
  useSwitchChain: () => ({ isPending: false, switchChainAsync }),
  useWalletClient: () => ({ data: undefined, isPending: false }),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/select", () => ({
  Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (value: string) => void }) => {
    controls.selectNetwork = onValueChange;
    return children;
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ children }: { children: React.ReactNode }) => children,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => null,
}));
vi.mock("./SearchableSelect", () => ({
  SearchableSelect: (props: NonNullable<typeof controls.token>) => {
    controls.token = props;
    return <input aria-expanded={false} role='combobox' />;
  },
}));
vi.mock("@/components/shared/CopyButton", () => ({ default: () => null }));

function balances(entries: Array<[string, bigint | null]>) {
  return Object.fromEntries(entries.map(([address, balance]) => [address.toLowerCase(), balance]));
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find((item) => item.children.includes(label));
}

async function renderReview(queryClient: QueryClient, destinationAmount: bigint | null = null) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <SquidQuoteReview
          acquisitionState='idle'
          destinationAmount={destinationAmount}
          onAcquired={vi.fn()}
          onBlocked={vi.fn()}
          onNetworkSwitchingChange={vi.fn()}
          onRejected={vi.fn()}
          onStarted={vi.fn()}
        />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

async function chooseNetwork(chainId: number) {
  await act(async () => controls.selectNetwork?.(String(chainId)));
}

async function expectTokenOptions(expected: string[]) {
  await vi.waitFor(() => expect(controls.token?.options.map(({ value }) => value)).toEqual(expected));
}

describe("SquidQuoteReview token inventory", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 3_000_000n : 1n,
    );
    fetchSourceTokens.mockImplementation(async (chainId: number) => (chainId === 10 ? [opToken] : [usdc, usdt]));
    readSourceTokenBalances.mockResolvedValue(
      balances([
        [usdc.token, 2_000_000n],
        [usdt.token, 0n],
      ]),
    );
    switchChainAsync.mockRejectedValue({ code: 4001 });
  });

  afterEach(() => {
    queryClient.clear();
    wallet.address = ownerA;
    wallet.chainId = 8453;
    controls.selectNetwork = undefined;
    controls.token = undefined;
  });

  it("defaults to held tokens, reveals the catalog, and preserves a selection as balances change", async () => {
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);
    await expectTokenOptions([usdc.token]);
    expect(controls.token?.options).toEqual([
      {
        aliases: [usdc.symbol, usdc.token],
        detail: "2",
        label: usdc.symbol,
        secondaryLabel: formatAddress(usdc.token),
        value: usdc.token,
      },
    ]);

    await act(async () => button(renderer, "Show all tokens")?.props.onClick());
    await expectTokenOptions([usdc.token, usdt.token]);
    await act(async () => controls.token?.onValueChange(usdt.token));
    await act(async () => button(renderer, "Show wallet tokens")?.props.onClick());

    await act(async () => {
      queryClient.setQueryData(
        sourceTokenBalancesQueryKey(ownerA, 8453, [usdc, usdt]),
        balances([
          [usdc.token, 0n],
          [usdt.token, 0n],
        ]),
      );
    });
    await expectTokenOptions([usdt.token]);
    expect(controls.token?.value).toBe(usdt.token);
  });

  it("uses the selected-token query instead of the inventory snapshot", async () => {
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);
    await expectTokenOptions([usdc.token]);

    await act(async () => controls.token?.onValueChange(usdc.token));

    await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain("3 USDC"));
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Balance2 USDC");
  });

  it("refreshes only the selected balance and keeps the previous value visible", async () => {
    let balanceReads = 0;
    let resolveRefresh!: (value: bigint) => void;
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName !== "balanceOf") return 1n;
      balanceReads += 1;
      if (balanceReads === 1) return 3_000_000n;
      return new Promise<bigint>((resolve) => {
        resolveRefresh = resolve;
      });
    });
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);
    await expectTokenOptions([usdc.token]);
    await act(async () => controls.token?.onValueChange(usdc.token));
    await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain("3 USDC"));

    await act(async () => button(renderer, "Refresh balance")?.props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain("3 USDC");
    expect(button(renderer, "Refreshing…")).toBeDefined();

    await act(async () => resolveRefresh(4_000_000n));
    await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain("4 USDC"));
    expect(readSourceTokenBalances).toHaveBeenCalledOnce();
  });

  it("reuses a fresh wallet inventory when the review remounts", async () => {
    const first = await renderReview(queryClient);
    await chooseNetwork(8453);
    await expectTokenOptions([usdc.token]);
    first.unmount();

    const second = await renderReview(queryClient);
    await chooseNetwork(8453);
    await expectTokenOptions([usdc.token]);

    expect(readSourceTokenBalances).toHaveBeenCalledOnce();
    second.unmount();
  });

  it("offers the stable catalog while wallet balances load", async () => {
    let resolveBalances!: (value: ReturnType<typeof balances>) => void;
    readSourceTokenBalances.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBalances = resolve;
        }),
    );
    const renderer = await renderReview(queryClient);

    await chooseNetwork(8453);
    await vi.waitFor(() => expect(readSourceTokenBalances).toHaveBeenCalledOnce());
    expect(renderer.root.findAllByProps({ role: "combobox" })).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Checking wallet balances");

    await act(async () => button(renderer, "Show all tokens")?.props.onClick());
    await expectTokenOptions([usdc.token, usdt.token]);
    expect(renderer.root.findAllByProps({ role: "combobox" })).toHaveLength(1);

    await act(async () =>
      resolveBalances(
        balances([
          [usdc.token, 2_000_000n],
          [usdt.token, 0n],
        ]),
      ),
    );
    await expectTokenOptions([usdc.token, usdt.token]);
    expect(renderer.root.findAllByProps({ role: "combobox" })).toHaveLength(1);

    await act(async () => button(renderer, "Show wallet tokens")?.props.onClick());
    await expectTokenOptions([usdc.token]);
  });

  it("keeps the complete catalog available while a failed balance inventory is retried", async () => {
    readSourceTokenBalances.mockRejectedValueOnce(new Error("RPC unavailable")).mockResolvedValueOnce(
      balances([
        [usdc.token, 2n],
        [usdt.token, 0n],
      ]),
    );
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);

    await expectTokenOptions([usdc.token, usdt.token]);
    await vi.waitFor(() => expect(button(renderer, "Retry balances")).toBeDefined());
    await act(async () => button(renderer, "Retry balances")?.props.onClick());
    await expectTokenOptions([usdc.token]);
    expect(readSourceTokenBalances).toHaveBeenCalledTimes(2);
  });

  it("ignores an older account inventory that resolves after the new account", async () => {
    let resolveOld!: (value: ReturnType<typeof balances>) => void;
    readSourceTokenBalances.mockImplementation((_client, owner) =>
      owner === ownerA
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(
            balances([
              [usdc.token, 0n],
              [usdt.token, 3n],
            ]),
          ),
    );
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);
    await vi.waitFor(() => expect(readSourceTokenBalances).toHaveBeenCalledOnce());

    wallet.address = ownerB;
    await act(async () =>
      renderer.update(
        <QueryClientProvider client={queryClient}>
          <SquidQuoteReview
            acquisitionState='idle'
            destinationAmount={null}
            onAcquired={vi.fn()}
            onBlocked={vi.fn()}
            onNetworkSwitchingChange={vi.fn()}
            onRejected={vi.fn()}
            onStarted={vi.fn()}
          />
        </QueryClientProvider>,
      ),
    );
    await expectTokenOptions([usdt.token]);

    await act(async () =>
      resolveOld(
        balances([
          [usdc.token, 4n],
          [usdt.token, 0n],
        ]),
      ),
    );
    await expectTokenOptions([usdt.token]);
  });

  it("ignores an older network inventory that resolves after the new network", async () => {
    let resolveBase!: (value: ReturnType<typeof balances>) => void;
    readSourceTokenBalances.mockImplementation((_client, _owner, tokens: (typeof usdc)[]) =>
      tokens[0]?.chainId === 8453
        ? new Promise((resolve) => {
            resolveBase = resolve;
          })
        : Promise.resolve(balances([[opToken.token, 5n]])),
    );
    const renderer = await renderReview(queryClient);
    await chooseNetwork(8453);
    await vi.waitFor(() => expect(readSourceTokenBalances).toHaveBeenCalledOnce());

    await chooseNetwork(10);
    await expectTokenOptions([opToken.token]);
    await act(async () =>
      resolveBase(
        balances([
          [usdc.token, 4n],
          [usdt.token, 0n],
        ]),
      ),
    );
    await expectTokenOptions([opToken.token]);
    renderer.unmount();
  });

  it("clears a stale balance error before reporting a rejected network switch", async () => {
    const destinationAmount = 1_000_000_000_000_000_000n;
    const plan: SquidFundingPlan = {
      maxSourceAmount: 2_000_000n,
      owner: ownerA,
      quotes: [
        {
          actions: [],
          costs: [
            {
              amount: 1n,
              kind: "gas",
              name: "Source gas",
              token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, decimals: 18, symbol: "ETH" },
            },
          ],
          destinationAmount,
          id: "quote",
          requirement: {
            amount: destinationAmount,
            chainId: 314,
            id: "requirement",
            recipient: ownerA,
            token: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045",
          },
          sourceAmount: 1_000_000n,
        },
      ],
      slippage: 1,
      source: usdc,
    };
    wallet.chainId = 10;
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 0n : 1n,
    );
    readSourceTokenBalances.mockResolvedValue(balances([[usdc.token, 0n]]));
    planSquidTopUp.mockResolvedValue(plan);
    const renderer = await renderReview(queryClient, destinationAmount);
    await chooseNetwork(8453);
    await act(async () => button(renderer, "Show all tokens")?.props.onClick());
    await expectTokenOptions([usdc.token, usdt.token]);
    await act(async () => controls.token?.onValueChange(usdc.token));
    await vi.waitFor(() => expect(button(renderer, "Get estimate")?.props.disabled).toBe(false));
    await act(async () => button(renderer, "Get estimate")?.props.onClick());
    expect(renderer.root.findByProps({ role: "alert" }).findByType("span").children.join("")).toContain(
      "You don't have enough USDC",
    );

    await act(async () => {
      queryClient.setQueryData(["squid", "source-balance", 8453, usdc.token, ownerA], 2_000_000n);
    });
    await vi.waitFor(() => expect(planSquidTopUp).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(button(renderer, "Switch wallet to Base")?.props.disabled).toBe(false));
    await act(async () => button(renderer, "Switch wallet to Base")?.props.onClick());

    expect(renderer.root.findByProps({ role: "alert" }).findByType("span").children.join("")).toBe(
      "Network switch cancelled in your wallet.",
    );
    renderer.unmount();
  });
});
