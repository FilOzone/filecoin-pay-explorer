import { describe, expect, it } from "vitest";
import { excludeDestinationUsdfc, nativeTokenFirst, sourceTokenCatalogMessage } from "./SquidQuoteReview";

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
