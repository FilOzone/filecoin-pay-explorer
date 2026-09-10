import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  excludeDestinationUsdfc,
  nativeTokenFirst,
  SquidQuoteSummary,
  sourceTokenCatalogMessage,
} from "./SquidQuoteReview";

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

describe("SquidQuoteSummary", () => {
  it("stacks values on narrow screens and uses tabular numerals", () => {
    const html = renderToStaticMarkup(
      SquidQuoteSummary({
        isNativeSource: true,
        maximumRequirement: "0.123456789 ETH",
        minimumReceive: "249 USDFC",
        pay: "0.1 ETH",
        reviewedReceive: "250 USDFC",
      }),
    );

    expect(html.match(/grid gap-0.5 sm:grid-cols-\[auto_minmax\(0,1fr\)\]/g)).toHaveLength(4);
    expect(html.match(/tabular-nums/g)).toHaveLength(4);
  });

  it("shows one maximum total for a native-token route", () => {
    const html = renderToStaticMarkup(
      SquidQuoteSummary({
        isNativeSource: true,
        maximumRequirement: "0.12 ETH",
        minimumReceive: "249 USDFC",
        pay: "0.1 ETH",
        reviewedReceive: "250 USDFC",
      }),
    );

    expect(html).toContain("You pay");
    expect(html).toContain("Execution minimum received");
    expect(html).toContain("249 USDFC");
    expect(html).toContain("Current reviewed quote");
    expect(html).toContain("250 USDFC");
    expect(html).toContain("Maximum total required");
    expect(html).toContain("0.12 ETH");
    expect(html).not.toContain("Maximum native fees required");
  });

  it("keeps ERC-20 spend separate from native fees", () => {
    const html = renderToStaticMarkup(
      SquidQuoteSummary({
        isNativeSource: false,
        maximumRequirement: "0.02 ETH",
        minimumReceive: "248 USDFC",
        pay: "250 USDC",
        reviewedReceive: "249 USDFC",
      }),
    );

    expect(html).toContain("250 USDC");
    expect(html).toContain("Maximum native fees required");
    expect(html).toContain("0.02 ETH");
    expect(html).not.toContain("Maximum total required");
  });
});
