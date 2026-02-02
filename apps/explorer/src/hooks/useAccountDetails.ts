import type { Account, OperatorApproval, Rail, UserToken } from "@filecoin-pay/types";
import {
  GET_ACCOUNT_APPROVALS,
  GET_ACCOUNT_DETAILS,
  GET_ACCOUNT_RAILS,
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

export const useAccountTokens = (accountId: string, page: number = 1, options?: AccountDetailsOptions) =>
  useGraphQLQuery<AccountTokensResponse, { userTokens: UserToken[]; hasMore: boolean }>({
    queryKey: ["account", accountId, "tokens", page],
    query: GET_ACCOUNT_TOKENS,
    variables: {
      accountId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      userTokens: data.userTokens,
      hasMore: data.userTokens.length === PAGE_SIZE,
    }),
    enabled: !!accountId,
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
