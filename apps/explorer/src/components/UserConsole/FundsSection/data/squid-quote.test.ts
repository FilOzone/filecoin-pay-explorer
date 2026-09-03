import { afterEach, describe, expect, it, vi } from "vitest";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { planSquidTopUp, squidFetch } from "./squid-quote";

const planSquidFunding = vi.hoisted(() => vi.fn());

vi.mock("@filecoin-project/squid-evm-funding", () => ({
  planSquidFunding,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdfc = "0x2222222222222222222222222222222222222222" as const;

describe("Squid quote review", () => {
  it("loads the token catalog through the same-origin proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ tokens: [] }), { headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await squidFetch("https://v2.api.squidrouter.com/v2/tokens", {
      headers: { "x-integrator-id": "test" },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/squid/tokens", {
      headers: { "x-integrator-id": "test" },
    });
    await expect(response.json()).resolves.toEqual({ tokens: [] });
  });

  it("answers concurrent catalog reads with one request and caches the body", async () => {
    vi.resetModules();
    const { squidFetch: freshSquidFetch } = await import("./squid-quote");
    let release!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const reads = [1, 8453, 42161].map(() => freshSquidFetch("https://v2.api.squidrouter.com/v2/tokens"));
    release(new Response(JSON.stringify({ tokens: [{ symbol: "USDC" }] })));
    const bodies = await Promise.all(reads.map(async (read) => (await read).json()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual(Array(3).fill({ tokens: [{ symbol: "USDC" }] }));

    // A later read within the cache window needs no request either.
    await expect((await freshSquidFetch("https://v2.api.squidrouter.com/v2/tokens")).json()).resolves.toEqual({
      tokens: [{ symbol: "USDC" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a failed catalog response through without caching it", async () => {
    vi.resetModules();
    const { squidFetch: freshSquidFetch } = await import("./squid-quote");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [] })));
    vi.stubGlobal("fetch", fetchMock);

    expect((await freshSquidFetch("https://v2.api.squidrouter.com/v2/tokens")).status).toBe(502);
    expect((await freshSquidFetch("https://v2.api.squidrouter.com/v2/tokens")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("plans an explicit Filecoin source cap", async () => {
    const quote = { id: "quote" };
    planSquidFunding.mockResolvedValue({
      maxSourceAmount: 2_000_000_000_000_000_000n,
      owner,
      quotes: [quote],
      slippage: 1,
      source: { chainId: 314, decimals: 18, symbol: "FIL", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    });

    await expect(
      planSquidTopUp({
        destinationAmount: 1_000_000_000_000_000_000n,
        destinationToken: usdfc,
        integratorId: "test",
        owner,
        source: {
          chainId: 314,
          decimals: 18,
          symbol: "FIL",
          token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        },
        sourceAmount: 2_000_000_000_000_000_000n,
      }),
    ).resolves.toMatchObject({ quotes: [{ id: "quote" }] });
    expect(planSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSourceAmount: "2",
        sourceChainId: 314,
        sourceToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      }),
      { fetch: expect.any(Function), integratorId: "test" },
    );
    expect(SQUID_SOURCE_CHAINS.map((chain) => chain.id)).toEqual([314, 42161, 1, 8453, 10, 137, 43114, 56]);
  });

  it("rejects a source outside the selected networks before requesting a route", async () => {
    await expect(
      planSquidTopUp({
        destinationAmount: 1n,
        destinationToken: usdfc,
        integratorId: "test",
        owner,
        source: { chainId: 5, decimals: 18, symbol: "ETH", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
        sourceAmount: 1n,
      }),
    ).rejects.toThrow("Select a supported source network");
  });
});
