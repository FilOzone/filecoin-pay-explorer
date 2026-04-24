import type { Token } from "@filecoin-pay/types";
import { GET_STATS_DASHBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface StatsDashboardData {
  tokens: [Token];
}

interface GetStatsDashboardResponse {
  usdfcToken: Token | null;
  filToken: Token | null;
}

export const useStatsDashboard = () =>
  useGraphQLQuery<GetStatsDashboardResponse, StatsDashboardData>({
    queryKey: ["statsDashboard"],
    query: GET_STATS_DASHBOARD,
    refetchInterval: 5 * 60 * 1000,
  });
