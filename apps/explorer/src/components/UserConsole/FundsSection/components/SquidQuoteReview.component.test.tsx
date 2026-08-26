import { NATIVE_TOKEN_ADDRESS, type SquidFundingPlan } from "@filecoin-project/squid-evm-funding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatAddress } from "@/utils/formatter";
import { SquidQuoteReview } from "./SquidQuoteReview";

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdc = {
  chainId: 8453,
  decimals: 6,
  symbol: "USDC",
  token: "0x3333333333333333333333333333333333333333" as const,
};
const controls = vi.hoisted(() => ({ inputs: {} as Record<string, (value: string) => void> }));
const fetchSourceTokens = vi.hoisted(() => vi.fn());
const planSquidTopUp = vi.hoisted(() => vi.fn());
const publicClient = vi.hoisted(() => ({
  getBalance: vi.fn().mockResolvedValue(1n),
  readContract: vi.fn().mockResolvedValue(1n),
}));

vi.mock("@filecoin-project/squid-evm-funding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@filecoin-project/squid-evm-funding")>()),
  fetchSourceTokens,
}));
vi.mock("../data/squid-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/squid-quote")>()),
  planSquidTopUp,
}));
vi.mock("use-debounce", () => ({ useDebounce: <T,>(value: T) => [value] }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: owner, chainId: 8453 }),
  usePublicClient: () => publicClient,
  useSwitchChain: () => ({ isPending: false, switchChainAsync: vi.fn() }),
  useWalletClient: () => ({ data: undefined, isPending: false }),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ id, onChange }: { id: string; onChange: (value: string) => void }) => {
    controls.inputs[id] = onChange;
    return <input id={id} />;
  },
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/shared/CopyButton", () => ({ default: () => null }));

afterEach(() => {
  controls.inputs = {};
  vi.clearAllMocks();
});

describe("SquidQuoteReview quote summary", () => {
  it("does not publish a maximum without gas and labels the two receive floors accurately", async () => {
    const plan: SquidFundingPlan = {
      maxSourceAmount: 2n,
      owner,
      quotes: [
        {
          actions: [],
          costs: [
            {
              amount: 0n,
              kind: "gas",
              name: "Source gas",
              token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, decimals: 18, symbol: "ETH" },
            },
          ],
          destinationAmount: 2_000_000_000_000_000_000n,
          id: "quote",
          requirement: {
            amount: 1_000_000_000_000_000_000n,
            chainId: 314,
            id: "requirement",
            recipient: owner,
            token: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045",
          },
          sourceAmount: 1n,
        },
      ],
      slippage: 1,
      source: usdc,
    };
    fetchSourceTokens.mockResolvedValue([usdc]);
    planSquidTopUp.mockResolvedValue(plan);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <SquidQuoteReview
            acquisitionState='idle'
            destinationAmount={1_000_000_000_000_000_000n}
            onAcquired={vi.fn()}
            onAcquisitionStateChange={vi.fn()}
            onBlocked={vi.fn()}
            onNetworkSwitchingChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });
    const sourceChain = SQUID_SOURCE_CHAINS.find(({ id }) => id === 8453);
    if (!sourceChain) throw new Error("Base source chain is unavailable");
    await act(async () => controls.inputs["squid-source-network"](sourceChain.name));
    await vi.waitFor(() => expect(fetchSourceTokens).toHaveBeenCalledOnce());
    const tokenLabel = `USDC (${formatAddress(usdc.token)})`;
    await vi.waitFor(() =>
      expect(renderer.root.findAllByType("option").some(({ props }) => props.value === tokenLabel)).toBe(true),
    );
    await act(async () => controls.inputs["squid-source-token"](tokenLabel));
    await vi.waitFor(() => expect(planSquidTopUp).toHaveBeenCalledOnce());

    const text = renderer.root.findAllByType("span").map(({ children }) => children.join(""));
    expect(text).toContain("Route minimum received");
    expect(text).toContain("2 USDFC");
    expect(text).toContain("Required amount");
    expect(text).toContain("1 USDFC");
    expect(text).toContain("Maximum native fees required");
    expect(text).toContain("Unavailable");
    expect(text).not.toContain("Calculating…");

    renderer.unmount();
    queryClient.clear();
  });
});
