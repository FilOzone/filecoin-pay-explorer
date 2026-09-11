import { QueryClient } from "@tanstack/react-query";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateAccountQueries, invalidateSourceBalanceQueries } from "./query-invalidation";

const OWNER = "0x1111111111111111111111111111111111111111";
const CHECKSUMMED_OWNER = getAddress("0xabcdef0000000000000000000000000000000001");

describe("invalidateAccountQueries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invalidates the account's data now and again once the subgraph has caught up", async () => {
    const queryClient = new QueryClient();
    const affected = [
      ["account", OWNER, "mainnet"],
      ["account", OWNER.toLowerCase(), "tokens", 1, 100, "mainnet"],
      ["account", OWNER.toLowerCase(), "approvals", 1, "mainnet"],
      ["account", OWNER.toLowerCase(), "rails", 1, "mainnet"],
      ["payments", "account-summary", 314, OWNER],
      ["balance", { address: OWNER }],
      ["readContract", { functionName: "balanceOf" }],
      ["rail", "7"],
      ["railSettlementAmounts", 314, "7"],
      ["direct-squid-destination-fil", OWNER],
      ["direct-squid-deposit-balances", 8453, "0xusdc", OWNER],
      ["squid", "source-token-balances", OWNER, 8453, "0xusdc"],
    ] as const;
    const untouched = [
      ["account", "0x2222222222222222222222222222222222222222", "mainnet"],
      ["direct-squid-deposit-quote", OWNER, OWNER, 8453, "0xusdc", "100", true],
    ] as const;
    for (const queryKey of [...affected, ...untouched]) queryClient.setQueryData(queryKey, "cached");
    const invalidated = () => affected.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated);

    await invalidateAccountQueries(queryClient, OWNER, { repeatAfterMs: [5_000] });
    expect(invalidated()).toEqual(affected.map(() => true));
    expect(untouched.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated)).toEqual([false, false]);

    for (const queryKey of affected) queryClient.setQueryData(queryKey, "refetched");
    expect(invalidated()).toEqual(affected.map(() => false));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(invalidated()).toEqual(affected.map(() => true));
  });

  it("refetches only mounted queries and lets a later mutation replace the pending passes", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const checksummedAccount = ["account", CHECKSUMMED_OWNER, "mainnet"] as const;
    queryClient.setQueryData(checksummedAccount, "cached");

    await invalidateAccountQueries(queryClient, CHECKSUMMED_OWNER, { repeatAfterMs: [5_000] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["readContract"], refetchType: "active" });
    const immediatePasses = invalidateQueries.mock.calls.length;

    await invalidateAccountQueries(queryClient, CHECKSUMMED_OWNER.toLowerCase(), { repeatAfterMs: [5_000] });
    queryClient.setQueryData(checksummedAccount, "refetched");
    await vi.advanceTimersByTimeAsync(5_000);
    // Two immediate passes and one delayed pass: the first mutation's timer was replaced, not stacked.
    expect(invalidateQueries.mock.calls.length).toBe(immediatePasses * 3);
    expect(queryClient.getQueryState(checksummedAccount)?.isInvalidated).toBe(true);
  });
});

describe("invalidateSourceBalanceQueries", () => {
  it("refreshes the funding dialogs' reads on one source network only", async () => {
    const queryClient = new QueryClient();
    const base = [
      ["squid", "source-token-balances", OWNER, 8453, "0xusdc"],
      ["direct-squid-deposit-balances", 8453, "0xusdc", OWNER],
    ] as const;
    const arbitrum = ["direct-squid-deposit-balances", 42161, "0xusdc", OWNER] as const;
    for (const queryKey of [...base, arbitrum]) queryClient.setQueryData(queryKey, "cached");

    await invalidateSourceBalanceQueries(queryClient, OWNER, 8453);
    expect(base.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated)).toEqual([true, true]);
    expect(queryClient.getQueryState(arbitrum)?.isInvalidated).toBe(false);
  });
});
