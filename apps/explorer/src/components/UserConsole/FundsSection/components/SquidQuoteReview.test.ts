import { describe, expect, it } from "vitest";
import {
  excludeDestinationUsdfc,
  nativeTokenFirst,
  resolveSearchableOption,
  shouldIncludeFilForFees,
  sourceTokenCatalogMessage,
  totalQuotedSourceAmount,
} from "./SquidQuoteReview";

describe("searchable option resolution", () => {
  const options = [
    { aliases: ["USDC"], label: "USDC (0x123…456)", value: "0x123" },
    { aliases: ["USDC"], label: "USDC (0x789…abc)", value: "0x789" },
    { aliases: ["ETH"], label: "ETH (0xeee…eee)", value: "0xeee" },
  ];

  it("resolves a selected label or an unambiguous alias", () => {
    expect(resolveSearchableOption(options, "usdc (0x123…456)")).toBe("0x123");
    expect(resolveSearchableOption(options, " eth ")).toBe("0xeee");
  });

  it("does not select free text or an ambiguous alias", () => {
    expect(resolveSearchableOption(options, "usd")).toBe("");
    expect(resolveSearchableOption(options, "USDC")).toBe("");
  });
});

describe("source token catalog messages", () => {
  it.each([
    [false, false, "Squid funding is not configured for this deployment."],
    [true, true, "Could not load tokens from Squid. Check the configuration or try again."],
    [true, false, "No supported tokens on this network."],
  ])("distinguishes configuration, request, and support states", (isConfigured, hasError, expected) => {
    expect(sourceTokenCatalogMessage(isConfigured, hasError)).toBe(expected);
  });
});

describe("source token ordering", () => {
  it("puts the native token first without changing the other catalog entries", () => {
    const tokens = [
      { token: "0x123", symbol: "USDC" },
      { token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", symbol: "ETH" },
      { token: "0x456", symbol: "USDT" },
    ];

    expect(nativeTokenFirst(tokens).map(({ symbol }) => symbol)).toEqual(["ETH", "USDC", "USDT"]);
  });
});

describe("source token safety", () => {
  it("excludes destination USDFC only when Filecoin is the source chain", () => {
    const tokens = [
      { token: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045", symbol: "USDFC" },
      { token: "0x1111111111111111111111111111111111111111", symbol: "OTHER" },
    ];

    expect(excludeDestinationUsdfc(tokens, 314)).toEqual([tokens[1]]);
    expect(excludeDestinationUsdfc(tokens, 8453)).toEqual(tokens);
  });
});

describe("Filecoin fee funding", () => {
  it("defaults to FIL for zero or unreadable balances, but not a funded wallet", () => {
    expect(shouldIncludeFilForFees(0n, false)).toBe(true);
    expect(shouldIncludeFilForFees(undefined, true)).toBe(true);
    expect(shouldIncludeFilForFees(1n, false)).toBe(false);
  });

  it("reviews the combined source spend for every requirement", () => {
    expect(totalQuotedSourceAmount([{ sourceAmount: 2n }, { sourceAmount: 3n }])).toBe(5n);
  });
});
