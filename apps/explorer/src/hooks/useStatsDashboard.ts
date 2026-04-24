import type { PaymentsMetric, Token } from "@filecoin-pay/types";
import type { Hex } from "viem";
import { GET_STATS_DASHBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface StatsDashboardData {
  usdfcToken: Token | null;
  filToken: Token | null;
  paymentsMetrics: PaymentsMetric;
}

interface GetStatsDashboardResponse {
  usdfcToken: Token;
  filToken: Token;
  paymentsMetrics: [PaymentsMetric];
}

export const useStatsDashboard = (usdfcAddress: Hex, filAddress: Hex) =>
  useGraphQLQuery<GetStatsDashboardResponse, StatsDashboardData>({
    queryKey: ["statsDashboard", usdfcAddress, filAddress],
    query: GET_STATS_DASHBOARD,
    variables: {
      usdfcAddress,
      filAddress,
    },
    select: (data) => ({
      usdfcToken: data.usdfcToken,
      filToken: data.filToken,
      paymentsMetrics: data.paymentsMetrics[0],
    }),
    enabled: !!usdfcAddress && !!filAddress,
    refetchInterval: 5 * 60 * 1000,
  });
