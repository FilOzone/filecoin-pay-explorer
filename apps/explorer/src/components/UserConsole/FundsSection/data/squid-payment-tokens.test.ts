import { describe, expect, it } from "vitest";
import { paymentTokensQueryOptions, selectPaymentTokens } from "./squid-payment-tokens";

const token = (chainId: number, address: `0x${string}`, symbol: string) => ({
  chainId,
  decimals: 18,
  symbol,
  token: address,
});

describe("selectPaymentTokens", () => {
  it("keeps the curated symbols and de-duplicates by chain and address", () => {
    const usdc = token(8453, "0x1111111111111111111111111111111111111111", "USDC");
    const sameAddressOtherChain = token(1, usdc.token, "USDC");
    expect(
      selectPaymentTokens(
        [
          token(8453, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "ETH"),
          usdc,
          { ...usdc, symbol: "USDT" },
          token(8453, "0x2222222222222222222222222222222222222222", "USDT"),
          token(8453, "0x3333333333333333333333333333333333333333", "DAI"),
          token(8453, "0x4444444444444444444444444444444444444444", "WETH"),
          token(8453, "0x5555555555555555555555555555555555555555", "WBTC"),
          token(8453, "0x6666666666666666666666666666666666666666", "AERO"),
          sameAddressOtherChain,
        ],
        8453,
      ),
    ).toEqual([
      token(8453, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "ETH"),
      usdc,
      token(8453, "0x2222222222222222222222222222222222222222", "USDT"),
      token(8453, "0x3333333333333333333333333333333333333333", "DAI"),
      token(8453, "0x4444444444444444444444444444444444444444", "WETH"),
      token(8453, "0x5555555555555555555555555555555555555555", "WBTC"),
    ]);
  });

  it("rejects an API-controlled catalog that would exceed one balance batch", () => {
    const tokens = Array.from({ length: 101 }, (_, index) =>
      token(8453, `0x${index.toString(16).padStart(40, "0")}` as `0x${string}`, "USDC"),
    );
    expect(() => selectPaymentTokens(tokens, 8453)).toThrow("too many supported payment tokens");
  });

  it("keys the selected-network catalog by chain and integrator", () => {
    expect(paymentTokensQueryOptions(8453, { integratorId: "test" }).queryKey).toEqual([
      "squid-payment-tokens",
      8453,
      "test",
    ]);
  });
});
