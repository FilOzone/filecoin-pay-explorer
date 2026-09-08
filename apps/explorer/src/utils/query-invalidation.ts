import type { QueryClient } from "@tanstack/react-query";
import { getAddress, isAddress } from "viem";

/**
 * Subgraph-backed queries lag the chain by a block or two, so one pass right
 * after the receipt often re-reads the stale index; a couple of later passes
 * catch up once the indexer has seen the block.
 */
const ACCOUNT_REFRESH_DELAYS_MS: readonly number[] = [10_000, 30_000];

/**
 * Query-key prefixes that any on-chain change to a console account can move.
 * The Squid quote key is deliberately absent: a quote under review must not
 * be swapped out underneath the user.
 */
function getAccountQueryPrefixes(address: string): readonly (readonly unknown[])[] {
  const ids = [...new Set([address, address.toLowerCase(), ...(isAddress(address) ? [getAddress(address)] : [])])];
  return [
    ...ids.map((id) => ["account", id] as const),
    ["payments", "account-summary"],
    ["balance"],
    ["readContract"],
    ["rail"],
    ["rails"],
    ["railSettlementAmounts"],
    ["direct-squid-destination-fil"],
    ["direct-squid-deposit-balances"],
    ["squid", "source-token-balances"],
  ];
}

// Only mounted observers refetch; everything else is marked stale and reloads
// when it is next shown, so a refresh never fans out to every cached read.
const ACTIVE_ONLY = { refetchType: "active" } as const;

function invalidateOnce(queryClient: QueryClient, address: string) {
  return Promise.all(
    getAccountQueryPrefixes(address).map((queryKey) => queryClient.invalidateQueries({ queryKey, ...ACTIVE_ONLY })),
  );
}

const scheduledRefreshes = new Map<string, ReturnType<typeof setTimeout>[]>();

/**
 * Refreshes everything the console shows for `address` after a confirmed
 * mutation: the immediate pass is awaited, the delayed passes run on their
 * own so the caller can move on. A second mutation for the same account
 * replaces its pending passes rather than stacking more.
 */
export function invalidateAccountQueries(
  queryClient: QueryClient,
  address: string,
  { repeatAfterMs = ACCOUNT_REFRESH_DELAYS_MS }: { repeatAfterMs?: readonly number[] } = {},
) {
  const key = address.toLowerCase();
  for (const timer of scheduledRefreshes.get(key) ?? []) clearTimeout(timer);
  scheduledRefreshes.set(
    key,
    repeatAfterMs.map((delay) =>
      setTimeout(() => void invalidateOnce(queryClient, address).catch(() => undefined), delay),
    ),
  );
  return invalidateOnce(queryClient, address);
}

/** A source-network balance moved (a card purchase landed): refresh what the funding dialogs read there. */
export function invalidateSourceBalanceQueries(queryClient: QueryClient, owner: string, chainId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["squid", "source-token-balances", owner, chainId], ...ACTIVE_ONLY }),
    queryClient.invalidateQueries({ queryKey: ["direct-squid-deposit-balances", chainId], ...ACTIVE_ONLY }),
  ]);
}
