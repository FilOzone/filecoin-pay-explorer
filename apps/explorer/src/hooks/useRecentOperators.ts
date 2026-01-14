import type { Operator } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { GET_RECENT_OPERATORS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface IRecentOperators {
  operators: Operator[];
}

const useRecentOperators = (first: number = 10) => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["recentOperators", first, network],
    queryFn: async () => {
      const response = await executeQuery<IRecentOperators>(GET_RECENT_OPERATORS, { first });
      return response.operators;
    },
    refetchInterval: 60 * 1000,
  });
};

export default useRecentOperators;
