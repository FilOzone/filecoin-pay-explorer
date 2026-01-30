import type { Operator, OperatorApproval, OperatorToken, Rail } from "@filecoin-pay/types";
import {
  GET_OPERATOR_APPROVALS,
  GET_OPERATOR_DETAILS,
  GET_OPERATOR_RAILS,
  GET_OPERATOR_TOKENS,
} from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface OperatorDetailsResponse {
  operators: Operator[];
}

interface OperatorTokensResponse {
  operatorTokens: OperatorToken[];
}

interface OperatorRailsResponse {
  rails: Rail[];
}

interface OperatorApprovalsResponse {
  operatorApprovals: OperatorApproval[];
}

const PAGE_SIZE = 10;

export const useOperatorDetails = (address: string) =>
  useGraphQLQuery<OperatorDetailsResponse, Operator | null>({
    queryKey: ["operator", address],
    query: GET_OPERATOR_DETAILS,
    variables: { address },
    select: (data) => data.operators[0] || null,
    enabled: !!address,
  });

export const useOperatorTokens = (operatorId: string, page: number = 1) =>
  useGraphQLQuery<OperatorTokensResponse, { operatorTokens: OperatorToken[]; hasMore: boolean }>({
    queryKey: ["operator", operatorId, "tokens", page],
    query: GET_OPERATOR_TOKENS,
    variables: {
      operatorId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      operatorTokens: data.operatorTokens,
      hasMore: data.operatorTokens.length === PAGE_SIZE,
    }),
    enabled: !!operatorId,
  });

export const useOperatorRails = (operatorId: string, page: number = 1) =>
  useGraphQLQuery<OperatorRailsResponse, { rails: Rail[]; hasMore: boolean }>({
    queryKey: ["operator", operatorId, "rails", page],
    query: GET_OPERATOR_RAILS,
    variables: {
      operatorId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      rails: data.rails,
      hasMore: data.rails.length === PAGE_SIZE,
    }),
    enabled: !!operatorId,
  });

export const useOperatorApprovals = (operatorId: string, page: number = 1) =>
  useGraphQLQuery<OperatorApprovalsResponse, { operatorApprovals: OperatorApproval[]; hasMore: boolean }>({
    queryKey: ["operator", operatorId, "approvals", page],
    query: GET_OPERATOR_APPROVALS,
    variables: {
      operatorId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      operatorApprovals: data.operatorApprovals,
      hasMore: data.operatorApprovals.length === PAGE_SIZE,
    }),
    enabled: !!operatorId,
  });
