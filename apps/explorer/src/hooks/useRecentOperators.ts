import type { Operator } from "@filecoin-pay/types";
import { GET_RECENT_OPERATORS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface RecentOperatorsResponse {
  operators: Operator[];
}

const useRecentOperators = (first: number = 10) =>
  useGraphQLQuery<RecentOperatorsResponse, Operator[]>({
    queryKey: ["recentOperators", first],
    query: GET_RECENT_OPERATORS,
    variables: { first },
    select: (data) => data.operators,
    refetchInterval: 60 * 1000,
  });

export default useRecentOperators;
