import type { Account, OperatorApproval, Rail, UserToken } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import {
  GET_ACCOUNT_APPROVALS,
  GET_ACCOUNT_DETAILS,
  GET_ACCOUNT_ONE_TIME_PAYMENTS,
  GET_ACCOUNT_RAILS,
  GET_ACCOUNT_RATE_PERIODS,
  GET_ACCOUNT_TOKEN,
  GET_ACCOUNT_TOKENS,
  GET_SUBGRAPH_BLOCK,
} from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLClient, useGraphQLQuery } from "./useGraphQLQuery";
import useNetwork from "./useNetwork";

interface AccountDetailsResponse {
  accounts: Account[];
}

interface AccountTokensResponse {
  userTokens: UserToken[];
}

interface AccountRailsResponse {
  rails: Rail[];
}

interface AccountApprovalsResponse {
  operatorApprovals: OperatorApproval[];
}

/** Raw shape of the spend-history queries; only `toSpendHistory` reads it. */
export interface SpendHistoryRatePeriodResponse {
  id: string;
  rate: string;
  startEpoch: string;
  /** Null while the period is open — the rail is still charging at this rate. */
  untilEpoch: string | null;
  operator: { address: string };
}

export interface SpendHistoryOneTimePaymentResponse {
  id: string;
  totalAmount: string;
  /** Unix seconds. */
  createdAt: string;
  operator: { address: string };
}

export interface AccountSpendHistoryResponse {
  /**
   * The epoch the history was read at — `block.number` is the Filecoin epoch, so
   * it compares directly with period bounds. Every page is pinned to it.
   *
   * Never null: the subgraph omits it only while a deployment is starting up,
   * and the loader throws in that case rather than returning a history the chart
   * would have no ceiling to integrate against.
   */
  _meta: { block: { number: number } };
  railRatePeriods: SpendHistoryRatePeriodResponse[];
  oneTimePayments: SpendHistoryOneTimePaymentResponse[];
  /**
   * Paging stopped at its cap rather than at the end of the data.
   *
   * This does mean records were left unread — the walk only stops early on a
   * full final page. What it cannot say is whether any of them fall inside the
   * charted months, or which: ids carry no order in time, so the rows that were
   * read are an arbitrary subset.
   */
  reachedPageLimit: boolean;
}

interface AccountDetailsOptions {
  networkOverride?: Network;
}

interface AccountTokensOptions extends AccountDetailsOptions {
  /**
   * Rows per request. Callers that render the list in one go — rather than
   * paging through it — pass a larger value to reduce how often a token falls
   * outside the response. It raises the cap; it does not remove it.
   */
  pageSize?: number;
}

const PAGE_SIZE = 10;

export const useAccountDetails = (address: string, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountDetailsResponse, Account | null>({
    queryKey: ["account", address],
    query: GET_ACCOUNT_DETAILS,
    variables: { address },
    select: (data) => data.accounts[0] || null,
    enabled: !!address,
    networkOverride: options?.networkOverride,
  });

export const useAccountTokens = (accountId: string, page: number = 1, options?: AccountTokensOptions) => {
  const pageSize = options?.pageSize ?? PAGE_SIZE;

  return useGraphQLQuery<AccountTokensResponse, { userTokens: UserToken[]; hasMore: boolean }>({
    // `pageSize` belongs in the key: callers asking for different sizes must not
    // share a cache entry for the same account and page.
    queryKey: ["account", accountId, "tokens", page, pageSize],
    query: GET_ACCOUNT_TOKENS,
    variables: {
      accountId,
      first: pageSize,
      skip: (page - 1) * pageSize,
    },
    select: (data) => ({
      userTokens: data.userTokens,
      hasMore: data.userTokens.length === pageSize,
    }),
    enabled: !!accountId,
    networkOverride: options?.networkOverride,
  });
};

export const useAccountToken = (accountId: string, tokenId: string, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountTokensResponse, UserToken | null>({
    queryKey: ["account", accountId, "tokens", "token", tokenId],
    query: GET_ACCOUNT_TOKEN,
    variables: { accountId, tokenId },
    select: (data) => data.userTokens[0] ?? null,
    enabled: !!accountId && !!tokenId,
    networkOverride: options?.networkOverride,
  });

export const useAccountRails = (accountId: string, page: number = 1, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountRailsResponse, { rails: Rail[]; hasMore: boolean }>({
    queryKey: ["account", accountId, "rails", page],
    query: GET_ACCOUNT_RAILS,
    variables: {
      accountId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      rails: data.rails,
      hasMore: data.rails.length === PAGE_SIZE,
    }),
    enabled: !!accountId,
    networkOverride: options?.networkOverride,
  });

/** graph-node's per-request maximum. */
const SPEND_HISTORY_PAGE_SIZE = 1_000;

/**
 * Pages to walk before giving up on a collection.
 *
 * A real account needs one or two: the busiest non-bot payer on calibration has
 * around 1,500 rate periods in six months. Bots run to tens of thousands, and
 * nothing useful is drawn from those, so the walk stops and the chart says the
 * months may be incomplete rather than issuing requests indefinitely.
 */
const SPEND_HISTORY_MAX_PAGES = 10;

/**
 * How long a read is held before it is replaced.
 *
 * The history is heavy and barely moves: months that have ended never change,
 * and the current month drifts by roughly 0.1% over half a day. `refetchInterval`
 * is what actually refreshes on this cadence — `staleTime` alone only marks the
 * data eligible, and a tab left open and visible would otherwise sit frozen
 * until it lost and regained focus.
 *
 * A one-time payment is a step change rather than a drift, so it can be up to
 * this long before appearing. Focus and reconnect still refresh sooner.
 */
const SPEND_HISTORY_REFRESH_MS = 12 * 60 * 60 * 1_000;

/**
 * Deliberately much shorter than the refresh interval. This history is large,
 * and it is cached per token — holding every token an account has looked at for
 * half a day costs far more than re-reading one.
 */
const SPEND_HISTORY_GC_MS = 30 * 60 * 1_000;

/**
 * Walks a cursor-paged collection until it is exhausted or `maxPages` is hit.
 *
 * Cursors on `id` rather than `skip`, which graph-node caps at 5,000. Mirrors
 * `getApprovedOperatorClients`, including the guard against a cursor that fails
 * to advance — that would otherwise spin forever.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (cursor: string) => Promise<T[]>,
  maxPages: number = SPEND_HISTORY_MAX_PAGES,
): Promise<{ items: T[]; reachedPageLimit: boolean }> {
  // Ids are transaction hash plus log index, so they carry no order in time.
  // Stopping at the cap therefore yields an arbitrary subset of the matching
  // records, not the newest or the oldest — which is why the chart says the
  // months may be incomplete rather than trying to describe what is missing.
  const items: T[] = [];
  let cursor = "0x";

  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(cursor);
    items.push(...rows);
    if (rows.length < SPEND_HISTORY_PAGE_SIZE) return { items, reachedPageLimit: false };

    const nextCursor = rows[rows.length - 1].id;
    if (!nextCursor || nextCursor === cursor) throw new Error("Spend history pagination did not advance");
    cursor = nextCursor;
  }

  return { items, reachedPageLimit: true };
}

/**
 * Every rate period and one-time payment touching the charted months.
 *
 * `windowStartEpoch` and `windowStartTimestamp` bound the read to the range the
 * chart draws. Without them the newest page of an active account covers hours,
 * and every earlier month renders as zero — the data is there, just not the part
 * that was asked for.
 */
export const useAccountSpendHistory = (
  accountId: string,
  tokenId: string,
  windowStartEpoch: bigint,
  windowStartTimestamp: bigint,
  options?: AccountDetailsOptions,
) => {
  const { network: contextNetwork } = useNetwork();
  const network = options?.networkOverride ?? contextNetwork;
  const { executeQuery } = useGraphQLClient({ networkOverride: options?.networkOverride });

  return useQuery<AccountSpendHistoryResponse>({
    queryKey: [
      "account",
      accountId,
      "spend-history",
      tokenId,
      windowStartEpoch.toString(),
      windowStartTimestamp.toString(),
      network,
    ],
    queryFn: async ({ signal }) => {
      // Read the block first and pin every page to it. Without a fixed snapshot
      // the two walks see different states, and cursor paging can miss rows
      // outright: ids are not ordered in time, so an entity written mid-walk can
      // land below the cursor.
      // Nullable here and only here: the subgraph omits `_meta` while a
      // deployment is starting up. Throwing lets Query retry, where falling back
      // to the clock would let open periods accrue past the data that exists —
      // and it is what lets everything downstream treat the block as given.
      const { _meta } = await executeQuery<{ _meta: AccountSpendHistoryResponse["_meta"] | null }>(
        GET_SUBGRAPH_BLOCK,
        undefined,
        signal,
      );

      if (!_meta) throw new Error("Subgraph has not reported an indexed block yet");
      const block = _meta.block.number;

      const [periods, payments] = await Promise.all([
        fetchAllPages<SpendHistoryRatePeriodResponse>(async (cursor) => {
          const page = await executeQuery<{ railRatePeriods: SpendHistoryRatePeriodResponse[] }>(
            GET_ACCOUNT_RATE_PERIODS,
            {
              accountId,
              tokenId,
              windowStartEpoch: windowStartEpoch.toString(),
              first: SPEND_HISTORY_PAGE_SIZE,
              cursor,
              block,
            },
            signal,
          );
          return page.railRatePeriods;
        }),
        fetchAllPages<SpendHistoryOneTimePaymentResponse>(async (cursor) => {
          const page = await executeQuery<{ oneTimePayments: SpendHistoryOneTimePaymentResponse[] }>(
            GET_ACCOUNT_ONE_TIME_PAYMENTS,
            {
              accountId,
              tokenId,
              windowStartTimestamp: windowStartTimestamp.toString(),
              first: SPEND_HISTORY_PAGE_SIZE,
              cursor,
              block,
            },
            signal,
          );
          return page.oneTimePayments;
        }),
      ]);

      return {
        _meta,
        railRatePeriods: periods.items,
        oneTimePayments: payments.items,
        reachedPageLimit: periods.reachedPageLimit || payments.reachedPageLimit,
      };
    },
    enabled: !!accountId && !!tokenId,
    staleTime: SPEND_HISTORY_REFRESH_MS,
    refetchInterval: SPEND_HISTORY_REFRESH_MS,
    gcTime: SPEND_HISTORY_GC_MS,
  });
};

export const useAccountApprovals = (accountId: string, page: number = 1, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountApprovalsResponse, { operatorApprovals: OperatorApproval[]; hasMore: boolean }>({
    queryKey: ["account", accountId, "approvals", page],
    query: GET_ACCOUNT_APPROVALS,
    variables: {
      accountId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      operatorApprovals: data.operatorApprovals,
      hasMore: data.operatorApprovals.length === PAGE_SIZE,
    }),
    enabled: !!accountId,
    networkOverride: options?.networkOverride,
  });
