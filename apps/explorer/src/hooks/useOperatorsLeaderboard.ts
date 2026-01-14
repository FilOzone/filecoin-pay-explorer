import type { Operator } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { GET_OPERATORS_LEADERBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface IOperatorsLeaderboard {
  operators: Operator[];
}

export type OperatorOrderBy = "totalRails" | "totalTokens" | "totalApprovals";

const useOperatorsLeaderboard = (first: number = 10, orderBy: OperatorOrderBy = "totalRails") => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["operatorsLeaderboard", first, orderBy, network],
    queryFn: async () => {
      const response = await executeQuery<IOperatorsLeaderboard>(GET_OPERATORS_LEADERBOARD, { first, orderBy });
      return response.operators;
    },
    refetchInterval: 60 * 1000,
  });
};

export default useOperatorsLeaderboard;
