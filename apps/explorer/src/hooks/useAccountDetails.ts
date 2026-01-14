import type { Account, OperatorApproval, Rail, UserToken } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import {
  GET_ACCOUNT_APPROVALS,
  GET_ACCOUNT_DETAILS,
  GET_ACCOUNT_RAILS,
  GET_ACCOUNT_TOKENS,
} from "@/services/grapql/queries";
import { type UseGraphQLQueryOptions, useGraphQLQuery } from "./useGraphQLQuery";

interface GetAccountDetailsResponse {
  accounts: Account[];
}

interface GetAccountTokensResponse {
  userTokens: UserToken[];
}

interface GetAccountRailsResponse {
  rails: Rail[];
}

interface GetAccountApprovalsResponse {
  operatorApprovals: OperatorApproval[];
}

const PAGE_SIZE = 10;

export const useAccountDetails = (address: string, options?: UseGraphQLQueryOptions) => {
  const { executeQuery, network } = useGraphQLQuery(options);

  return useQuery({
    queryKey: ["account", address, network],
    queryFn: async () => {
      const response = await executeQuery<GetAccountDetailsResponse>(GET_ACCOUNT_DETAILS, {
        address: address,
      });
      return response.accounts[0] || null;
    },
    enabled: !!address,
  });
};

export const useAccountTokens = (accountId: string, page: number = 1, options?: UseGraphQLQueryOptions) => {
  const { executeQuery, network } = useGraphQLQuery(options);

  return useQuery({
    queryKey: ["account", accountId, "tokens", page, network],
    queryFn: async () => {
      const response = await executeQuery<GetAccountTokensResponse>(GET_ACCOUNT_TOKENS, {
        accountId: accountId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        userTokens: response.userTokens,
        hasMore: response.userTokens.length === PAGE_SIZE,
      };
    },
    enabled: !!accountId,
  });
};

export const useAccountRails = (accountId: string, page: number = 1, options?: UseGraphQLQueryOptions) => {
  const { executeQuery, network } = useGraphQLQuery(options);

  return useQuery({
    queryKey: ["account", accountId, "rails", page, network],
    queryFn: async () => {
      const response = await executeQuery<GetAccountRailsResponse>(GET_ACCOUNT_RAILS, {
        accountId: accountId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        rails: response.rails,
        hasMore: response.rails.length === PAGE_SIZE,
      };
    },
    enabled: !!accountId,
  });
};

export const useAccountApprovals = (accountId: string, page: number = 1, options?: UseGraphQLQueryOptions) => {
  const { executeQuery, network } = useGraphQLQuery(options);

  return useQuery({
    queryKey: ["account", accountId, "approvals", page, network],
    queryFn: async () => {
      const response = await executeQuery<GetAccountApprovalsResponse>(GET_ACCOUNT_APPROVALS, {
        accountId: accountId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        operatorApprovals: response.operatorApprovals,
        hasMore: response.operatorApprovals.length === PAGE_SIZE,
      };
    },
    enabled: !!accountId,
  });
};
