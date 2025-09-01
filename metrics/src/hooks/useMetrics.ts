import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "../services/graphql/client";
import {
  GET_PAYMENTS_METRICS,
  GET_DAILY_METRICS,
  GET_WEEKLY_METRICS,
  GET_TOP_TOKENS,
  GET_DAILY_TOKEN_METRICS,
  GET_TOP_OPERATORS,
  GET_DAILY_OPERATOR_METRICS,
} from "../services/graphql/queries";
import type {
  PaymentsMetric,
  DailyMetric,
  WeeklyMetric,
  Token,
  Operator,
  TokenMetric,
  OperatorMetric,
} from "../types/metrics";

// Hook for payments metrics
export const usePaymentsMetrics = () => {
  return useQuery({
    queryKey: ["paymentsMetrics"],
    queryFn: async () => {
      const data = await executeQuery<{ paymentsMetrics: PaymentsMetric[] }>(
        GET_PAYMENTS_METRICS,
        {},
        "GetPaymentsMetrics",
      );
      return data.paymentsMetrics[0];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
};

// Hook for daily metrics
export const useDailyMetrics = (days: number = 30) => {
  return useQuery({
    queryKey: ["dailyMetrics", days],
    queryFn: async () => {
      const data = await executeQuery<{ dailyMetrics: DailyMetric[] }>(
        GET_DAILY_METRICS,
        { first: days },
        "GetDailyMetrics",
      );
      return data.dailyMetrics;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000, // Refetch every minute
  });
};

// Hook for weekly metrics
export const useWeeklyMetrics = (weeks: number = 12) => {
  return useQuery({
    queryKey: ["weeklyMetrics", weeks],
    queryFn: async () => {
      const data = await executeQuery<{ weeklyMetrics: WeeklyMetric[] }>(
        GET_WEEKLY_METRICS,
        { first: weeks },
        "GetWeeklyMetrics",
      );
      return data.weeklyMetrics;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
};

// Hook for top tokens
export const useTopTokens = (limit: number = 4) => {
  return useQuery({
    queryKey: ["topTokens", limit],
    queryFn: async () => {
      const data = await executeQuery<{ tokens: Token[] }>(GET_TOP_TOKENS, { first: limit }, "GetTopTokens");
      return data.tokens;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
};

// Hook for token metrics with timeframe support
export const useTokenMetrics = (period: number = 30) => {
  const topTokensQuery = useTopTokens();

  return useQuery({
    queryKey: ["tokenMetrics", period],
    queryFn: async () => {
      const data = await executeQuery<{
        dailyTokenMetrics: TokenMetric[];
      }>(
        GET_DAILY_TOKEN_METRICS,
        { first: period, tokenIds: topTokensQuery.data?.map((t) => t.id) },
        "GetDailyTokenMetrics",
      );
      return data.dailyTokenMetrics;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: !!topTokensQuery.data,
  });
};

// Hook for top operators
export const useTopOperators = (limit: number = 4) => {
  return useQuery({
    queryKey: ["topOperators", limit],
    queryFn: async () => {
      const data = await executeQuery<{ operators: Operator[] }>(
        GET_TOP_OPERATORS,
        { first: limit },
        "GetTopOperators",
      );
      return data.operators;
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
};

// Hook for operator metrics with timeframe support
export const useOperatorMetrics = (period: number = 30) => {
  const topOperatorsQuery = useTopOperators();

  return useQuery({
    queryKey: ["operatorMetrics", period],
    queryFn: async () => {
      const data = await executeQuery<{ dailyOperatorMetrics: OperatorMetric[] }>(
        GET_DAILY_OPERATOR_METRICS,
        { first: period, operatorIds: topOperatorsQuery.data?.map((o) => o.id) },
        "GetDailyOperatorMetrics",
      );
      return data.dailyOperatorMetrics;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: !!topOperatorsQuery.data,
  });
};

// Combined hook for all metrics (useful for dashboard overview)
export const useAllMetrics = () => {
  const paymentsQuery = usePaymentsMetrics();
  const dailyQuery = useDailyMetrics();
  const weeklyQuery = useWeeklyMetrics();
  const topTokensQuery = useTopTokens();
  const topOperatorsQuery = useTopOperators();
  const tokenMetricsQuery = useTokenMetrics();
  const operatorMetricsQuery = useOperatorMetrics();

  return {
    payments: paymentsQuery,
    daily: dailyQuery,
    weekly: weeklyQuery,
    topTokens: topTokensQuery,
    topOperators: topOperatorsQuery,
    tokenMetrics: tokenMetricsQuery,
    operatorMetrics: operatorMetricsQuery,
    isLoading:
      paymentsQuery.isLoading ||
      dailyQuery.isLoading ||
      weeklyQuery.isLoading ||
      topTokensQuery.isLoading ||
      topOperatorsQuery.isLoading ||
      tokenMetricsQuery.isLoading ||
      operatorMetricsQuery.isLoading,
    isError:
      paymentsQuery.isError ||
      dailyQuery.isError ||
      weeklyQuery.isError ||
      topTokensQuery.isError ||
      topOperatorsQuery.isError ||
      tokenMetricsQuery.isError ||
      operatorMetricsQuery.isError,
    refetchAll: () => {
      paymentsQuery.refetch();
      dailyQuery.refetch();
      weeklyQuery.refetch();
      topTokensQuery.refetch();
      topOperatorsQuery.refetch();
      tokenMetricsQuery.refetch();
      operatorMetricsQuery.refetch();
    },
  };
};
