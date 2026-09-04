import { describe, expect, it } from "vitest";
import { compactTokenBalance, excludeDestinationUsdfc, sourceTokenCatalogMessage } from "./SquidQuoteReview";

describe("compact token balances", () => {
  it("keeps useful precision without repeating the token symbol", () => {
    expect(compactTokenBalance(32_156_494_224_197n, 18)).toBe("0.0000321565");
    expect(compactTokenBalance(1_250_000_000_000n, 6)).toBe("1.25M");
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
