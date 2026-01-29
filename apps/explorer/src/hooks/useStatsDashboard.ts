import type { PaymentsMetric, Token } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { executeQuery } from "@/services/grapql/client";
import { GET_STATS_DASHBOARD } from "@/services/grapql/queries";

export interface StatsDashboardData {
  paymentsMetrics: PaymentsMetric;
  usdfcToken: Token | null;
  filToken: Token | null;
}

interface GetStatsDashboardResponse {
  paymentsMetrics: PaymentsMetric[];
  usdfcToken: Token | null;
  filToken: Token | null;
}

export const useStatsDashboard = (usdfcAddress: Hex, filAddress: Hex) =>
  useQuery({
    queryKey: ["statsDashboard", usdfcAddress, filAddress],
    queryFn: async () => {
      const response = await executeQuery<GetStatsDashboardResponse>(GET_STATS_DASHBOARD, {
        usdfcAddress,
        filAddress,
      });

      return {
        paymentsMetrics: response.paymentsMetrics[0],
        usdfcToken: response.usdfcToken,
        filToken: response.filToken,
      } as StatsDashboardData;
    },
    refetchInterval: 60 * 1000,
  });
