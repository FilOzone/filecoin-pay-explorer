import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  fetchPaymentTokens,
  isStablecoinSymbol,
  parsePaymentTokens,
  paymentTokensQueryOptions,
  selectPaymentTokens,
} from "./squid-payment-tokens";

const raw = (chainId: number, address: string, symbol: string, decimals = 18, usdPrice?: unknown) => ({
  address,
  chainId: String(chainId),
  decimals,
  symbol,
  ...(usdPrice === undefined ? {} : { usdPrice }),
});
const USDC = raw(8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6, 0.9998);
const USDBC = raw(8453, "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6, 1);
const ETH = raw(8453, NATIVE_TOKEN_ADDRESS, "ETH", 18, 3012.5);
const USDT = raw(8453, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", "USDT", 6, 1);
const DAI = raw(8453, "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", "DAI", 18, 1);
const WETH = raw(8453, "0x4200000000000000000000000000000000000006", "WETH", 18, 3012.5);
const AERO = raw(8453, "0x940181a94A35A4569E4529A3CDfB74e38FD98631", "AERO", 18, 1.2);
const ARB_USDC = raw(42161, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6, 1);

describe("parsePaymentTokens", () => {
  it("keeps one network's tokens with their price, and drops malformed or duplicate entries", () => {
    const tokens = parsePaymentTokens(
      {
        tokens: [
          USDC,
          ARB_USDC,
          { ...USDC, address: USDC.address.toLowerCase() },
          raw(8453, "0x4200000000000000000000000000000000000006", "WETH", 18, "not a price"),
          raw(8453, "nope", "BAD"),
          { ...raw(8453, "0x1111111111111111111111111111111111111111", "  "), usdPrice: 1 },
          null,
        ],
      },
      8453,
    );
    expect(tokens).toEqual([
      { chainId: 8453, decimals: 6, symbol: "USDC", token: USDC.address.toLowerCase(), usdPrice: 0.9998 },
      { chainId: 8453, decimals: 18, symbol: "WETH", token: "0x4200000000000000000000000000000000000006" },
    ]);
    expect(() => parsePaymentTokens({}, 8453)).toThrow("Invalid Squid token catalog");
  });
});

describe("selectPaymentTokens", () => {
  it("leads with plain USDC, then bridged USDC, the native coin, and the other stablecoins and majors", () => {
    const tokens = parsePaymentTokens({ tokens: [AERO, WETH, DAI, ETH, USDBC, USDT, USDC] }, 8453);
    expect(selectPaymentTokens(tokens).map((token) => token.symbol)).toEqual([
      "USDC",
      "USDbC",
      "ETH",
      "WETH",
      "DAI",
      "USDT",
    ]);
  });

  it("knows which symbols are worth a dollar", () => {
    expect(["USDC", "USDbC", "USDT", "DAI", "usdt0"].map(isStablecoinSymbol)).toEqual([true, true, true, true, true]);
    expect(["ETH", "WETH", "WBTC", "AERO"].map(isStablecoinSymbol)).toEqual([false, false, false, false]);
  });
});

describe("fetchPaymentTokens", () => {
  it("asks Squid's catalog with the integrator ID and narrows it to the payable set", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ tokens: [AERO, ETH, USDC] }), { status: 200 }));
    const tokens = await fetchPaymentTokens(8453, { fetch, integratorId: "id" });
    expect(fetch).toHaveBeenCalledWith("https://v2.api.squidrouter.com/v2/tokens", {
      headers: { "x-integrator-id": "id" },
    });
    expect(tokens.map((token) => token.symbol)).toEqual(["USDC", "ETH"]);
    expect(paymentTokensQueryOptions(8453, { integratorId: "id" }).queryKey).toEqual([
      "squid-payment-tokens",
      8453,
      "id",
    ]);
  });

  it("surfaces a failed catalog request", async () => {
    const fetch = vi.fn(async () => new Response("busy", { status: 429 }));
    await expect(fetchPaymentTokens(8453, { fetch, integratorId: "id" })).rejects.toThrow(
      "Squid tokens request failed (429)",
    );
  });
});
