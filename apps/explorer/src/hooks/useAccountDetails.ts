import type { Account, OperatorApproval, Rail, UserToken } from "@filecoin-pay/types";
import {
  GET_ACCOUNT_APPROVALS,
  GET_ACCOUNT_DETAILS,
  GET_ACCOUNT_RAILS,
  GET_ACCOUNT_SPEND_HISTORY,
  GET_ACCOUNT_TOKEN,
  GET_ACCOUNT_TOKENS,
} from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLQuery } from "./useGraphQLQuery";

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

/** Raw shape of `GET_ACCOUNT_SPEND_HISTORY`; only `toRailSpendInput` reads it. */
export interface SpendHistoryRailResponse {
  paymentRate: string;
  endEpoch: string;
  /** Unix seconds. The subgraph stores no creation epoch, so it is derived from genesis. */
  createdAt: string;
  rateChangeQueue: Array<{ startEpoch: string; untilEpoch: string; rate: string }>;
  oneTimePayments: Array<{ totalAmount: string; createdAt: string }>;
}

export interface AccountSpendHistoryResponse {
  /**
   * The epoch this response was read at — `block.number` is the Filecoin epoch,
   * so it compares directly with `endEpoch` and segment bounds. Null while a
   * deployment is still starting up.
   */
  _meta: { block: { number: number } } | null;
  rails: SpendHistoryRailResponse[];
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

/**
 * Caps on this spend-history read. The entities can be paged through top-level
 * queries, but this first version deliberately makes one bounded request. A
 * response that fills either cap may be incomplete —
 * `hasReachedSpendHistoryLimit` compares against these so the chart can say so.
 */
export const SPEND_HISTORY_RAIL_LIMIT = 500;
export const SPEND_HISTORY_NESTED_LIMIT = 1_000;

/** Every figure is frozen at fetch time, and 30 minutes is the accepted staleness for the current month. */
const SPEND_HISTORY_REFETCH_MS = 30 * 60 * 1_000;

export const useAccountSpendHistory = (accountId: string, tokenId: string, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountSpendHistoryResponse>({
    queryKey: ["account", accountId, "spend-history", tokenId],
    query: GET_ACCOUNT_SPEND_HISTORY,
    variables: { accountId, tokenId, first: SPEND_HISTORY_RAIL_LIMIT, nested: SPEND_HISTORY_NESTED_LIMIT },
    enabled: !!accountId && !!tokenId,
    networkOverride: options?.networkOverride,
    staleTime: SPEND_HISTORY_REFETCH_MS,
    refetchInterval: SPEND_HISTORY_REFETCH_MS,
  });

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
