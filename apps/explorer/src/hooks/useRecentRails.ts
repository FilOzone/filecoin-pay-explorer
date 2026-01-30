import type { Rail } from "@filecoin-pay/types";
import { GET_RECENT_RAILS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface RecentRailsResponse {
  rails: Rail[];
}

const useRecentRails = (first: number = 10) =>
  useGraphQLQuery<RecentRailsResponse, Rail[]>({
    queryKey: ["recentRails", first],
    query: GET_RECENT_RAILS,
    variables: { first },
    select: (data) => data.rails,
    refetchInterval: 60 * 1000,
  });

export default useRecentRails;
