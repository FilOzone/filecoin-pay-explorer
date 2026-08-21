import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { consoleDisplayView, invalidateTopUpQueries, parseTopUpAmount } from "./guided-top-up";

describe("guided top-up", () => {
  it("parses an editable 18-decimal USDFC amount", () => {
    expect(parseTopUpAmount("1.25")).toBe(1_250_000_000_000_000_000n);
    expect(parseTopUpAmount("0")).toBeNull();
    expect(parseTopUpAmount("not-a-number")).toBeNull();
  });

  it("invalidates account and balance data after a top-up", async () => {
    const queryClient = new QueryClient();
    const accountId = "indexed-account";
    const accountOwner = "0x1111111111111111111111111111111111111111";
    const affectedKeys = [
      ["account", accountOwner, "mainnet"],
      ["account", accountId, "tokens", 1, "mainnet"],
      ["payments", "account-summary", 314, accountOwner],
      ["balance", accountOwner],
      ["readContract", "payments"],
    ] as const;
    const unaffectedKey = ["account", "another-owner", "mainnet"] as const;

    for (const queryKey of [...affectedKeys, unaffectedKey]) queryClient.setQueryData(queryKey, "cached");

    await invalidateTopUpQueries(queryClient, accountId, accountOwner);

    expect(affectedKeys.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(queryClient.getQueryState(unaffectedKey)?.isInvalidated).toBe(false);
  });

  it("keeps the Filecoin console visible while topping up from a source chain", () => {
    expect(consoleDisplayView("unsupported", true, true)).toBe("filecoin");
    // Dialog closed, or a chain Squid cannot fund from: the unsupported state stands.
    expect(consoleDisplayView("unsupported", true, false)).toBe("unsupported");
    expect(consoleDisplayView("unsupported", false, true)).toBe("unsupported");
    // Supported networks are never rewritten.
    expect(consoleDisplayView("filecoin", true, true)).toBe("filecoin");
    expect(consoleDisplayView("pending", true, true)).toBe("pending");
  });
});
