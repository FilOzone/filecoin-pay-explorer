import type { Operator, OperatorApproval, OperatorToken, Rail } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import {
  GET_OPERATOR_APPROVALS,
  GET_OPERATOR_DETAILS,
  GET_OPERATOR_RAILS,
  GET_OPERATOR_TOKENS,
} from "@/services/grapql/queries";

interface GetOperatorDetailsResponse {
  operators: Operator[];
}

interface GetOperatorTokensResponse {
  operatorTokens: OperatorToken[];
}

interface GetOperatorRailsResponse {
  rails: Rail[];
}

interface GetOperatorApprovalsResponse {
  operatorApprovals: OperatorApproval[];
}

const PAGE_SIZE = 10;

export const useOperatorDetails = (address: string) => {
  return useQuery({
    queryKey: ["operator", address],
    queryFn: async () => {
      const response = await executeQuery<GetOperatorDetailsResponse>(GET_OPERATOR_DETAILS, {
        address: address,
      });
      return response.operators[0] || null;
    },
    enabled: !!address,
  });
};

export const useOperatorTokens = (operatorId: string, page: number = 1) => {
  return useQuery({
    queryKey: ["operator", operatorId, "tokens", page],
    queryFn: async () => {
      const response = await executeQuery<GetOperatorTokensResponse>(GET_OPERATOR_TOKENS, {
        operatorId: operatorId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        operatorTokens: response.operatorTokens,
        hasMore: response.operatorTokens.length === PAGE_SIZE,
      };
    },
    enabled: !!operatorId,
  });
};

export const useOperatorRails = (operatorId: string, page: number = 1) => {
  return useQuery({
    queryKey: ["operator", operatorId, "rails", page],
    queryFn: async () => {
      const response = await executeQuery<GetOperatorRailsResponse>(GET_OPERATOR_RAILS, {
        operatorId: operatorId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        rails: response.rails,
        hasMore: response.rails.length === PAGE_SIZE,
      };
    },
    enabled: !!operatorId,
  });
};

export const useOperatorApprovals = (operatorId: string, page: number = 1) => {
  return useQuery({
    queryKey: ["operator", operatorId, "approvals", page],
    queryFn: async () => {
      const response = await executeQuery<GetOperatorApprovalsResponse>(GET_OPERATOR_APPROVALS, {
        operatorId: operatorId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        operatorApprovals: response.operatorApprovals,
        hasMore: response.operatorApprovals.length === PAGE_SIZE,
      };
    },
    enabled: !!operatorId,
  });
};
