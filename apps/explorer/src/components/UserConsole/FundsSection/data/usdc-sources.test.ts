import { describe, expect, it, vi } from "vitest";
import {
  type BalanceReader,
  findCardUsdcToken,
  findUsdcSourceCovering,
  formatUsdcBalance,
  fundedUsdcSourceOptions,
  isSameUsdcSource,
  parseUsdcSourceValue,
  pickDefaultUsdcSource,
  rankUsdcSources,
  readUsdcSources,
  type UsdcSource,
} from "./usdc-sources";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const token = (chainId: number, address: string, decimals = 6, symbol = "USDC") => ({
  chainId,
  decimals,
  symbol,
  token: address as `0x${string}`,
});
const BASE_USDC = token(8453, "0x4444444444444444444444444444444444444444");
const BASE_USDBC = token(8453, "0x5555555555555555555555555555555555555555", 6, "USDbC");
const ARBITRUM_USDC = token(42161, "0x6666666666666666666666666666666666666666");
const BSC_USDC = token(56, "0x7777777777777777777777777777777777777777", 18);

const source = (t: ReturnType<typeof token>, balance: bigint): UsdcSource => ({
  balance,
  chainId: t.chainId,
  token: t,
});

describe("readUsdcSources", () => {
  it("asks for every listed token in one multicall and treats a failed read as an empty balance", async () => {
    const multicall = vi.fn(async (_args: Parameters<BalanceReader["multicall"]>[0]) => [
      { status: "success" as const, result: 120_500_000n },
      { status: "failure" as const },
    ]);
    const sources = await readUsdcSources({
      chainId: 8453,
      client: { multicall },
      owner: OWNER,
      tokens: [BASE_USDC, BASE_USDBC],
    });
    expect(multicall).toHaveBeenCalledOnce();
    expect(multicall.mock.calls[0][0].contracts.map((c) => [c.address, c.functionName, c.args])).toEqual([
      [BASE_USDC.token, "balanceOf", [OWNER]],
      [BASE_USDBC.token, "balanceOf", [OWNER]],
    ]);
    expect(sources).toEqual([source(BASE_USDC, 120_500_000n), source(BASE_USDBC, 0n)]);
  });

  it("skips the network call when Squid lists no USDC", async () => {
    const multicall = vi.fn();
    expect(await readUsdcSources({ chainId: 1, client: { multicall }, owner: OWNER, tokens: [] })).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });
});

describe("ranking USDC sources", () => {
  const sources = [
    source(BASE_USDC, 5_000_000n), // 5 USDC
    source(ARBITRUM_USDC, 120_500_000n), // 120.5 USDC
    source(BSC_USDC, 7n * 10n ** 18n), // 7 USDC with 18 decimals
    source(BASE_USDBC, 0n),
  ];

  it("puts the largest balance first across different decimals and keeps ties in order", () => {
    expect(rankUsdcSources(sources).map((s) => s.token)).toEqual([ARBITRUM_USDC, BSC_USDC, BASE_USDC, BASE_USDBC]);
    expect(rankUsdcSources([source(BASE_USDC, 0n), source(ARBITRUM_USDC, 0n)]).map((s) => s.token)).toEqual([
      BASE_USDC,
      ARBITRUM_USDC,
    ]);
  });

  it("defaults to the best funded source and to nothing when every balance is empty", () => {
    expect(pickDefaultUsdcSource(sources)?.token).toEqual(ARBITRUM_USDC);
    expect(pickDefaultUsdcSource([source(BASE_USDC, 0n)])).toBeUndefined();
  });

  it("finds the largest source that covers the typed amount", () => {
    expect(findUsdcSourceCovering(sources, "6")?.token).toEqual(ARBITRUM_USDC);
    expect(findUsdcSourceCovering(sources, "121")).toBeUndefined();
    expect(findUsdcSourceCovering(sources, "")).toBeUndefined();
    expect(findUsdcSourceCovering(sources, "abc")).toBeUndefined();
  });

  it("matches a choice by network and token regardless of address case", () => {
    const choice = { chainId: 8453, token: BASE_USDC.token.toUpperCase().replace("0X", "0x") };
    expect(isSameUsdcSource(source(BASE_USDC, 1n), choice)).toBe(true);
    expect(isSameUsdcSource(source(BASE_USDBC, 1n), choice)).toBe(false);
    expect(isSameUsdcSource(source(BASE_USDC, 1n), undefined)).toBe(false);
  });

  it("formats balances with at most two decimals and names dust as less than a cent", () => {
    expect(formatUsdcBalance(source(ARBITRUM_USDC, 120_500_000n))).toBe("120.5");
    expect(formatUsdcBalance(source(BSC_USDC, 7n * 10n ** 18n))).toBe("7");
    expect(formatUsdcBalance(source(BASE_USDC, 1_234_567n))).toBe("1.23");
    expect(formatUsdcBalance(source(BASE_USDC, 4_999n))).toBe("<0.01");
    expect(formatUsdcBalance(source(BASE_USDC, 10_000n))).toBe("0.01");
    expect(formatUsdcBalance(source(BASE_USDC, 0n))).toBe("0");
  });
});

describe("fundedUsdcSourceOptions", () => {
  const chains = [
    { id: 8453, name: "Base" },
    { id: 42161, name: "Arbitrum" },
    { id: 1, name: "Ethereum" },
  ];

  it("lists only funded pairs, largest first, with the address only where symbols collide", () => {
    const options = fundedUsdcSourceOptions({
      chains,
      sources: [
        source(BASE_USDC, 5_000_000n),
        source(BASE_USDBC, 0n),
        source(ARBITRUM_USDC, 120_500_000n),
        source(token(42161, "0x8888888888888888888888888888888888888888"), 0n),
      ],
    });
    expect(options.map((o) => o.label)).toEqual(["Arbitrum · USDC (0x6666...6666) · 120.5", "Base · USDC · 5"]);
    expect(parseUsdcSourceValue(options[0].value)).toEqual({ chainId: 42161, token: ARBITRUM_USDC.token });
    expect(fundedUsdcSourceOptions({ chains, sources: [source(BASE_USDC, 0n)] })).toEqual([]);
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
