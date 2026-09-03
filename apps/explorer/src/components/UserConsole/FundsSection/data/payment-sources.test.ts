import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  type BalanceReader,
  findCardUsdcToken,
  findPaymentSourceCovering,
  formatSourceBalance,
  formatSourceUsdValue,
  fundedPaymentSourceOptions,
  getSourceUsdValue,
  isSamePaymentSource,
  type PaymentSource,
  parsePaymentSourceValue,
  pickDefaultPaymentSource,
  rankPaymentSources,
  readPaymentSources,
} from "./payment-sources";
import type { PaymentToken } from "./squid-payment-tokens";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const token = (chainId: number, address: string, decimals = 6, symbol = "USDC", usdPrice?: number): PaymentToken => ({
  chainId,
  decimals,
  symbol,
  token: address as `0x${string}`,
  ...(usdPrice === undefined ? {} : { usdPrice }),
});
const BASE_USDC = token(8453, "0x4444444444444444444444444444444444444444");
const BASE_USDBC = token(8453, "0x5555555555555555555555555555555555555555", 6, "USDbC");
const BASE_ETH = token(8453, NATIVE_TOKEN_ADDRESS, 18, "ETH", 3000);
const BASE_USDT = token(8453, "0x9999999999999999999999999999999999999999", 6, "USDT");
const ARBITRUM_USDC = token(42161, "0x6666666666666666666666666666666666666666");
const ARBITRUM_ETH = token(42161, NATIVE_TOKEN_ADDRESS, 18, "ETH", 3000);
const BSC_USDC = token(56, "0x7777777777777777777777777777777777777777", 18);

const source = (t: PaymentToken, balance: bigint): PaymentSource => ({ balance, chainId: t.chainId, token: t });

describe("readPaymentSources", () => {
  it("reads the ERC-20s in one multicall and the native coin beside it, treating a failed read as empty", async () => {
    const multicall = vi.fn(async (_args: Parameters<BalanceReader["multicall"]>[0]) => [
      { status: "success" as const, result: 120_500_000n },
      { status: "failure" as const },
    ]);
    const getBalance = vi.fn(async () => 5n * 10n ** 16n);
    const sources = await readPaymentSources({
      chainId: 8453,
      client: { getBalance, multicall },
      owner: OWNER,
      tokens: [BASE_USDC, BASE_ETH, BASE_USDBC],
    });
    expect(multicall).toHaveBeenCalledOnce();
    expect(multicall.mock.calls[0][0].contracts.map((c) => [c.address, c.functionName, c.args])).toEqual([
      [BASE_USDC.token, "balanceOf", [OWNER]],
      [BASE_USDBC.token, "balanceOf", [OWNER]],
    ]);
    expect(getBalance).toHaveBeenCalledWith({ address: OWNER });
    expect(sources).toEqual([
      source(BASE_USDC, 120_500_000n),
      source(BASE_ETH, 5n * 10n ** 16n),
      source(BASE_USDBC, 0n),
    ]);
  });

  it("skips the network calls it does not need", async () => {
    const multicall = vi.fn();
    const getBalance = vi.fn(async () => {
      throw new Error("down");
    });
    expect(
      await readPaymentSources({ chainId: 1, client: { getBalance, multicall }, owner: OWNER, tokens: [] }),
    ).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
    // A native read that fails reads as empty rather than failing the network.
    expect(
      await readPaymentSources({ chainId: 8453, client: { getBalance, multicall }, owner: OWNER, tokens: [BASE_ETH] }),
    ).toEqual([source(BASE_ETH, 0n)]);
    expect(multicall).not.toHaveBeenCalled();
  });
});

describe("ranking payment sources", () => {
  const sources = [
    source(BASE_USDC, 5_000_000n), // 5 USDC
    source(BASE_ETH, 10n ** 18n), // 1 ETH, worth $3000
    source(ARBITRUM_USDC, 120_500_000n), // 120.5 USDC
    source(BSC_USDC, 7n * 10n ** 18n), // 7 USDC with 18 decimals
    source(BASE_USDT, 900_000_000n), // 900 USDT
    source(BASE_USDBC, 0n),
  ];

  it("values a balance in dollars from the catalog price, or a dollar a unit for an unpriced stablecoin", () => {
    expect(getSourceUsdValue(source(BASE_ETH, 5n * 10n ** 17n))).toBe(1500);
    expect(getSourceUsdValue(source(BASE_USDT, 900_000_000n))).toBe(900);
    expect(
      getSourceUsdValue(source(token(8453, "0x8888888888888888888888888888888888888888", 18, "WBTC"), 10n ** 18n)),
    ).toBe(0);
  });

  it("puts USDC first by balance, then everything else by dollar value, keeping ties in order", () => {
    expect(rankPaymentSources(sources).map((s) => s.token)).toEqual([
      ARBITRUM_USDC,
      BSC_USDC,
      BASE_USDC,
      BASE_USDBC,
      BASE_ETH,
      BASE_USDT,
    ]);
    expect(rankPaymentSources([source(BASE_USDC, 0n), source(ARBITRUM_USDC, 0n)]).map((s) => s.token)).toEqual([
      BASE_USDC,
      ARBITRUM_USDC,
    ]);
  });

  it("defaults to the best funded source, USDC before a richer ETH balance, and to nothing when all are empty", () => {
    expect(pickDefaultPaymentSource(sources)?.token).toEqual(ARBITRUM_USDC);
    expect(pickDefaultPaymentSource([source(BASE_USDC, 0n), source(BASE_ETH, 10n ** 18n)])?.token).toEqual(BASE_ETH);
    expect(pickDefaultPaymentSource([source(BASE_USDC, 0n)])).toBeUndefined();
  });

  it("finds the best source of the same token that covers the typed amount", () => {
    expect(findPaymentSourceCovering(sources, "6", "USDC")?.token).toEqual(ARBITRUM_USDC);
    expect(findPaymentSourceCovering(sources, "121", "USDC")).toBeUndefined();
    // An ETH amount is never covered by USDC, however much of it there is.
    expect(findPaymentSourceCovering(sources, "0.5", "ETH")?.token).toEqual(BASE_ETH);
    expect(findPaymentSourceCovering([...sources, source(ARBITRUM_ETH, 2n * 10n ** 18n)], "1.5", "eth")?.token).toEqual(
      ARBITRUM_ETH,
    );
    expect(findPaymentSourceCovering(sources, "", "USDC")).toBeUndefined();
    expect(findPaymentSourceCovering(sources, "abc", "USDC")).toBeUndefined();
  });

  it("matches a choice by network and token regardless of address case", () => {
    const choice = { chainId: 8453, token: BASE_USDC.token.toUpperCase().replace("0X", "0x") };
    expect(isSamePaymentSource(source(BASE_USDC, 1n), choice)).toBe(true);
    expect(isSamePaymentSource(source(BASE_USDBC, 1n), choice)).toBe(false);
    expect(isSamePaymentSource(source(BASE_USDC, 1n), undefined)).toBe(false);
  });

  it("formats stablecoins to two decimals and other tokens to four, naming dust as less than that", () => {
    expect(formatSourceBalance(source(ARBITRUM_USDC, 120_500_000n))).toBe("120.5");
    expect(formatSourceBalance(source(BSC_USDC, 7n * 10n ** 18n))).toBe("7");
    expect(formatSourceBalance(source(BASE_USDC, 1_234_567n))).toBe("1.23");
    expect(formatSourceBalance(source(BASE_USDC, 4_999n))).toBe("<0.01");
    expect(formatSourceBalance(source(BASE_USDC, 10_000n))).toBe("0.01");
    expect(formatSourceBalance(source(BASE_USDC, 0n))).toBe("0");
    expect(formatSourceBalance(source(BASE_ETH, 12_345_678n * 10n ** 10n))).toBe("0.1234");
    expect(formatSourceBalance(source(BASE_ETH, 10n ** 13n))).toBe("<0.0001");
  });

  it("shows a dollar value only for a priced token that is not itself a dollar", () => {
    expect(formatSourceUsdValue(source(BASE_ETH, 5n * 10n ** 16n))).toBe("≈ $150.00");
    expect(formatSourceUsdValue(source(BASE_ETH, 40n * 10n ** 18n))).toBe("≈ $120,000.00");
    expect(formatSourceUsdValue(source(BASE_ETH, 10n ** 12n))).toBe("≈ <$0.01");
    expect(formatSourceUsdValue(source(BASE_USDC, 5_000_000n))).toBeUndefined();
    expect(
      formatSourceUsdValue(source(token(8453, "0x8888888888888888888888888888888888888888", 18, "WBTC"), 1n)),
    ).toBeUndefined();
  });
});

describe("fundedPaymentSourceOptions", () => {
  const chains = [
    { id: 8453, name: "Base" },
    { id: 42161, name: "Arbitrum" },
    { id: 1, name: "Ethereum" },
  ];

  it("lists only funded pairs, USDC first, with a dollar value for other tokens and the address only where symbols collide", () => {
    const options = fundedPaymentSourceOptions({
      chains,
      sources: [
        source(BASE_USDC, 5_000_000n),
        source(BASE_USDBC, 0n),
        source(BASE_ETH, 5n * 10n ** 16n),
        source(ARBITRUM_USDC, 120_500_000n),
        source(token(42161, "0x8888888888888888888888888888888888888888"), 0n),
      ],
    });
    expect(options.map((o) => o.label)).toEqual([
      "Arbitrum · USDC (0x6666...6666) · 120.5",
      "Base · USDC · 5",
      "Base · ETH · 0.05 (≈ $150.00)",
    ]);
    expect(parsePaymentSourceValue(options[0].value)).toEqual({ chainId: 42161, token: ARBITRUM_USDC.token });
    expect(fundedPaymentSourceOptions({ chains, sources: [source(BASE_USDC, 0n)] })).toEqual([]);
  });

  it("delivers a card purchase to Squid's plain USDC, else the network's native USDC, never a bridged one", () => {
    const sources = [source(BASE_USDBC, 0n), source(BASE_USDC, 0n), source(ARBITRUM_USDC, 0n)];
    expect(findCardUsdcToken(sources, 8453)).toEqual(BASE_USDC);
    expect(findCardUsdcToken([source(BASE_USDBC, 0n)], 8453)).toEqual({
      chainId: 8453,
      decimals: 6,
      symbol: "USDC",
      token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    });
    expect(findCardUsdcToken(sources, 137)?.token).toBe("0x3c499c542cef5e3811e1192ce70d8cc03d5c3359");
    expect(findCardUsdcToken(sources, 10)).toBeUndefined();
  });
});
