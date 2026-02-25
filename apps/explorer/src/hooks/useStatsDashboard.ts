import type { Token } from "@filecoin-pay/types";
import type { Hex } from "viem";
import { GET_STATS_DASHBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface StatsDashboardData {
  usdfcToken: Token | null;
  filToken: Token | null;
}

interface GetStatsDashboardResponse {
  usdfcToken: Token | null;
  filToken: Token | null;
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
    }),
    enabled: !!usdfcAddress && !!filAddress,
    refetchInterval: 5 * 60 * 1000,
  });
