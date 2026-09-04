import type { Account, OperatorApproval, Rail, UserToken } from "@filecoin-pay/types";
import { getMockAccount, MOCK_CONSOLE_SERVICES } from "@/mocks/console-services";
import {
  GET_ACCOUNT_APPROVALS,
  GET_ACCOUNT_DETAILS,
  GET_ACCOUNT_RAILS,
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

export const useAccountDetails = (address: string, options?: AccountDetailsOptions) => {
  const query = useGraphQLQuery<AccountDetailsResponse, Account | null>({
    queryKey: ["account", address],
    query: GET_ACCOUNT_DETAILS,
    variables: { address },
    select: (data) => data.accounts[0] || null,
    enabled: !MOCK_CONSOLE_SERVICES && !!address,
    networkOverride: options?.networkOverride,
  });

  // MOCK: see src/mocks/console-services.ts. Without this the console stops at
  // its "account not indexed" state and never reaches the services section.
  if (MOCK_CONSOLE_SERVICES && address) {
    return { ...query, data: getMockAccount(address), error: null, isLoading: false, isError: false };
  }

  return query;
};

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
