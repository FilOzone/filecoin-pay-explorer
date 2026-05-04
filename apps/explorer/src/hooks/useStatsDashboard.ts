import type { PaymentsMetric, Token } from "@filecoin-pay/types";
import { GET_STATS_DASHBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface StatsDashboardData {
  tokens: Token[];
  paymentsMetrics: PaymentsMetric | undefined;
}

interface GetStatsDashboardResponse {
  tokens: Token[];
  paymentsMetrics: PaymentsMetric[];
}

export const useStatsDashboard = () =>
  useGraphQLQuery<GetStatsDashboardResponse, StatsDashboardData>({
    queryKey: ["statsDashboard"],
    query: GET_STATS_DASHBOARD,
    select: (data) => ({
      tokens: data.tokens,
      paymentsMetrics: data.paymentsMetrics[0],
    }),
    refetchInterval: 5 * 60 * 1000,
  });
