import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { buildUsdcSourceQuery, USDC_SCAN_CHAINS, useUsdcBalancesAcrossChains } from "./useUsdcBalancesAcrossChains";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const BASE_USDC = {
  chainId: 8453,
  token: "0x4444444444444444444444444444444444444444" as const,
  symbol: "USDC",
  decimals: 6,
};
const ARB_USDC = {
  chainId: 42161,
  token: "0x6666666666666666666666666666666666666666" as const,
  symbol: "USDC",
  decimals: 6,
};

const queries = vi.hoisted(() => ({
  results: [] as { data?: unknown; isPending: boolean; refetch: () => Promise<unknown> }[],
  received: [] as { enabled: boolean; queryKey: unknown[] }[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries: list }: { queries: { enabled: boolean; queryKey: unknown[] }[] }) => {
    queries.received = list;
    return list.map((_, index) => queries.results[index] ?? { data: undefined, isPending: true, refetch: vi.fn() });
  },
  useQueryClient: () => ({ fetchQuery: vi.fn() }),
}));
vi.mock("wagmi", () => ({ useConfig: () => ({}) }));
vi.mock("wagmi/actions", () => ({ getPublicClient: () => undefined }));

describe("buildUsdcSourceQuery", () => {
  it("loads Squid's list, then reads every balance through the network's client", async () => {
    const multicall = vi.fn(async () => [{ status: "success" as const, result: 5_000_000n }]);
    const query = buildUsdcSourceQuery({
      chainId: 8453,
      getClient: () => ({ multicall }),
      loadTokens: async () => [BASE_USDC],
      owner: OWNER,
    });
    expect(query.queryKey).toEqual(["squid-usdc-sources", 8453, OWNER]);
    expect(await query.queryFn()).toEqual([{ balance: 5_000_000n, chainId: 8453, token: BASE_USDC }]);
  });

  it("fails loudly without a wallet or a client", async () => {
    const loadTokens = async () => [BASE_USDC];
    await expect(
      buildUsdcSourceQuery({ chainId: 8453, getClient: () => undefined, loadTokens, owner: undefined }).queryFn(),
    ).rejects.toThrow("No wallet to scan");
    await expect(
      buildUsdcSourceQuery({ chainId: 8453, getClient: () => undefined, loadTokens, owner: OWNER }).queryFn(),
    ).rejects.toThrow("No RPC client for chain 8453");
  });
});

describe("useUsdcBalancesAcrossChains", () => {
  let latest!: ReturnType<typeof useUsdcBalancesAcrossChains>;
  function Harness(props: Parameters<typeof useUsdcBalancesAcrossChains>[0]) {
    latest = useUsdcBalancesAcrossChains(props);
    return null;
  }
  const squid = { integratorId: "test" };

  it("scans every Squid source network but Filecoin for the checksummed wallet and ranks what comes back", async () => {
    expect(USDC_SCAN_CHAINS.map((chain) => chain.id)).toEqual(
      SQUID_SOURCE_CHAINS.map((chain) => chain.id).filter((id) => id !== 314),
    );
    expect(USDC_SCAN_CHAINS.length).toBeGreaterThan(0);
    queries.results = USDC_SCAN_CHAINS.map((chain) => ({
      data:
        chain.id === 8453
          ? [{ balance: 5_000_000n, chainId: 8453, token: BASE_USDC }]
          : chain.id === 42161
            ? [{ balance: 120_500_000n, chainId: 42161, token: ARB_USDC }]
            : [],
      isPending: false,
      refetch: vi.fn(async () => undefined),
    }));
    await act(async () => {
      create(<Harness enabled owner={OWNER.toLowerCase()} squid={squid} />);
    });
    expect(queries.received.map((q) => q.queryKey)).toEqual(
      USDC_SCAN_CHAINS.map((chain) => ["squid-usdc-sources", chain.id, OWNER]),
    );
    expect(queries.received.every((q) => q.enabled)).toBe(true);
    expect(latest.sources.map((s) => [s.chainId, s.balance])).toEqual([
      [42161, 120_500_000n],
      [8453, 5_000_000n],
    ]);
    expect(latest.isPending).toBe(false);
    await latest.refetch();
    expect(queries.results.every((r) => (r.refetch as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true);
  });

  it("stays idle without a wallet and reports pending while any network is still answering", async () => {
    queries.results = [];
    await act(async () => {
      create(<Harness enabled owner={undefined} squid={squid} />);
    });
    expect(queries.received.every((q) => !q.enabled)).toBe(true);
    expect(latest.isPending).toBe(false);
    expect(latest.sources).toEqual([]);

    await act(async () => {
      create(<Harness enabled owner={OWNER} squid={squid} />);
    });
    expect(latest.isPending).toBe(true);
  });
});
