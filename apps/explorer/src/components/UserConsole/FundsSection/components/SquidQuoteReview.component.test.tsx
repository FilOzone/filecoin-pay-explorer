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
const readSourceTokenBalances = vi.hoisted(() => vi.fn());
const publicClient = vi.hoisted(() => ({
  getBalance: vi.fn().mockResolvedValue(1n),
  multicall: vi.fn(),
  readContract: vi.fn().mockResolvedValue(1n),
}));

vi.mock("@filecoin-project/squid-evm-funding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@filecoin-project/squid-evm-funding")>()),
  fetchSourceTokens,
}));
vi.mock("../data/source-token-balances", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/source-token-balances")>()),
  readSourceTokenBalances,
}));
vi.mock("use-debounce", () => ({ useDebounce: <T,>(value: T) => [value] }));
vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  usePublicClient: () => publicClient,
  useSwitchChain: () => ({ isPending: false, switchChainAsync: vi.fn() }),
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

async function renderReview(queryClient: QueryClient) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <SquidQuoteReview
          acquisitionState='idle'
          destinationAmount={null}
          onAcquired={vi.fn()}
          onAcquisitionStateChange={vi.fn()}
          onBlocked={vi.fn()}
          onNetworkSwitchingChange={vi.fn()}
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
    fetchSourceTokens.mockImplementation(async (chainId: number) => (chainId === 10 ? [opToken] : [usdc, usdt]));
    readSourceTokenBalances.mockResolvedValue(
      balances([
        [usdc.token, 2_000_000n],
        [usdt.token, 0n],
      ]),
    );
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
        detail: "2 USDC",
        label: `${usdc.symbol} (${formatAddress(usdc.token)})`,
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

  it("shows a loading state instead of the catalog until wallet balances resolve", async () => {
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

    await act(async () =>
      resolveBalances(
        balances([
          [usdc.token, 2_000_000n],
          [usdt.token, 0n],
        ]),
      ),
    );
    await expectTokenOptions([usdc.token]);
    expect(renderer.root.findAllByProps({ role: "combobox" })).toHaveLength(1);
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
            onAcquisitionStateChange={vi.fn()}
            onBlocked={vi.fn()}
            onNetworkSwitchingChange={vi.fn()}
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
});
