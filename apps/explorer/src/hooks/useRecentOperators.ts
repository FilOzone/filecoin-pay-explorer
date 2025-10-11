import type { Operator } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_RECENT_OPERATORS } from "@/services/grapql/queries";

export interface IRecentOperators {
  operators: Operator[];
}

const useRecentOperators = (first: number = 10) =>
  useQuery({
    queryKey: ["recentOperators", first],
    queryFn: async () => {
      const response = await executeQuery<IRecentOperators>(GET_RECENT_OPERATORS, { first });
      return response.operators;
    },
    refetchInterval: 60 * 1000,
  });

export default useRecentOperators;
