import type {
  DailyMetric,
  DailyOperatorMetric as OperatorMetric,
  OperatorToken,
  PaymentsMetric,
  Token,
  DailyTokenMetric as TokenMetric,
  WeeklyMetric,
} from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "../services/graphql/client";
import {
  GET_DAILY_METRICS,
  GET_DAILY_OPERATOR_METRICS,
  GET_DAILY_TOKEN_METRICS,
  GET_PAYMENTS_METRICS,
  GET_TOP_OPERATOR_TOKENS,
  GET_TOP_TOKENS,
  GET_WEEKLY_METRICS,
} from "../services/graphql/queries";

// Hook for payments metrics
export const usePaymentsMetrics = () =>
  useQuery({
    queryKey: ["paymentsMetrics"],
    queryFn: async () => {
      const data = await executeQuery<{ paymentsMetrics: PaymentsMetric[] }>(GET_PAYMENTS_METRICS, {});
      return data.paymentsMetrics[0];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

// Hook for daily metrics
export const useDailyMetrics = (days: number = 30) =>
  useQuery({
    queryKey: ["dailyMetrics", days],
    queryFn: async () => {
      const data = await executeQuery<{ dailyMetrics: DailyMetric[] }>(GET_DAILY_METRICS, { first: days });
      return data.dailyMetrics;
    },
    staleTime: 5 * 60 * 1000,
  });

// Hook for weekly metrics
export const useWeeklyMetrics = (weeks: number = 12) =>
  useQuery({
    queryKey: ["weeklyMetrics", weeks],
    queryFn: async () => {
      const data = await executeQuery<{ weeklyMetrics: WeeklyMetric[] }>(GET_WEEKLY_METRICS, { first: weeks });
      return data.weeklyMetrics;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

// Hook for top tokens
export const useTopTokens = (limit: number = 4) =>
  useQuery({
    queryKey: ["topTokens", limit],
    queryFn: async () => {
      const data = await executeQuery<{ tokens: Token[] }>(GET_TOP_TOKENS, {
        first: limit,
      });
      return data.tokens;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

// Hook for token metrics with timeframe support
export const useTokenMetrics = (period: number = 30) => {
  const topTokensQuery = useTopTokens();

  return useQuery({
    queryKey: ["tokenMetrics", period],
    queryFn: async () => {
      const data = await executeQuery<{
        dailyTokenMetrics: TokenMetric[];
      }>(GET_DAILY_TOKEN_METRICS, {
        first: period,
        tokenIds: topTokensQuery.data?.map((t) => t.id),
      });
      return data.dailyTokenMetrics;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!topTokensQuery.data,
  });
};

// Hook for top operators
export const useTopOperatorTokens = (limit: number = 4) =>
  useQuery({
    queryKey: ["topOperatorTokens", limit],
    queryFn: async () => {
      const data = await executeQuery<{ operatorTokens: OperatorToken[] }>(GET_TOP_OPERATOR_TOKENS, { first: limit });
      return data.operatorTokens;
    },
    staleTime: 10 * 60 * 1000,
  });

// Hook for operator metrics with timeframe support
export const useOperatorMetrics = (period: number = 30) => {
  const topOperatorTokensQuery = useTopOperatorTokens();

  return useQuery({
    queryKey: ["operatorMetrics", period],
    queryFn: async () => {
      const data = await executeQuery<{
        dailyOperatorMetrics: OperatorMetric[];
      }>(GET_DAILY_OPERATOR_METRICS, {
        first: period,
        operatorIds: topOperatorTokensQuery.data?.map((o) => o.operator.id),
      });
      return data.dailyOperatorMetrics;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!topOperatorTokensQuery.data,
  });
};

// Combined hook for all metrics (useful for dashboard overview)
export const useAllMetrics = () => {
  const paymentsQuery = usePaymentsMetrics();
  const dailyQuery = useDailyMetrics();
  const weeklyQuery = useWeeklyMetrics();
  const topTokensQuery = useTopTokens();
  const topOperatorTokensQuery = useTopOperatorTokens();
  const tokenMetricsQuery = useTokenMetrics();
  const operatorMetricsQuery = useOperatorMetrics();

  return {
    payments: paymentsQuery,
    daily: dailyQuery,
    weekly: weeklyQuery,
    topTokens: topTokensQuery,
    topOperatorTokens: topOperatorTokensQuery,
    tokenMetrics: tokenMetricsQuery,
    operatorMetrics: operatorMetricsQuery,
    isLoading:
      paymentsQuery.isLoading ||
      dailyQuery.isLoading ||
      weeklyQuery.isLoading ||
      topTokensQuery.isLoading ||
      topOperatorTokensQuery.isLoading ||
      tokenMetricsQuery.isLoading ||
      operatorMetricsQuery.isLoading,
    isError:
      paymentsQuery.isError ||
      dailyQuery.isError ||
      weeklyQuery.isError ||
      topTokensQuery.isError ||
      topOperatorTokensQuery.isError ||
      tokenMetricsQuery.isError ||
      operatorMetricsQuery.isError,
    refetchAll: () => {
      paymentsQuery.refetch();
      dailyQuery.refetch();
      weeklyQuery.refetch();
      topTokensQuery.refetch();
      topOperatorTokensQuery.refetch();
      tokenMetricsQuery.refetch();
      operatorMetricsQuery.refetch();
    },
  };
};
