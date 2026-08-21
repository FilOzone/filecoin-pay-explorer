import { describe, expect, it } from "vitest";
import {
  acquireNetworkMismatchMessage,
  resolveSearchableOption,
  sourceSpendCap,
  sourceTokenCatalogMessage,
  walletClientUnavailableMessage,
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

describe("source spend cap", () => {
  it("reserves the maximum network fee when the source token is native", () => {
    expect(sourceSpendCap(10n, 3n, true)).toBe(7n);
    expect(sourceSpendCap(3n, 3n, true)).toBe(0n);
  });

  it("does not subtract native fees from an ERC-20 balance", () => {
    expect(sourceSpendCap(10n, 3n, false)).toBe(10n);
  });
});

describe("wallet client unavailable message", () => {
  it("surfaces the underlying wagmi error instead of a dead end", () => {
    expect(walletClientUnavailableMessage(new Error("Connector not connected."))).toBe(
      "Wallet or network client is unavailable: Connector not connected.",
    );
  });

  it("falls back to a generic message when there is no underlying error", () => {
    expect(walletClientUnavailableMessage(null)).toBe("Wallet or network client is unavailable.");
  });
});

describe("acquire network mismatch message", () => {
  it("asks for a switch when the wallet is on a different chain than the source", () => {
    expect(acquireNetworkMismatchMessage(314, 8453, "Base")).toBe("Switch your wallet to Base to acquire USDFC.");
  });

  it("falls back to a generic network name when chain metadata is missing", () => {
    expect(acquireNetworkMismatchMessage(314, 8453, undefined)).toBe(
      "Switch your wallet to the selected source network to acquire USDFC.",
    );
  });

  it("stays silent when chains match or either chain is unknown", () => {
    expect(acquireNetworkMismatchMessage(8453, 8453, "Base")).toBeNull();
    expect(acquireNetworkMismatchMessage(undefined, 8453, "Base")).toBeNull();
    expect(acquireNetworkMismatchMessage(314, undefined, "Base")).toBeNull();
  });
});
