import type { Operator } from "@filecoin-pay/types";
import { GET_OPERATORS_LEADERBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface OperatorsLeaderboardResponse {
  operators: Operator[];
}

export type OperatorOrderBy = "totalRails" | "totalTokens" | "totalApprovals";

const useOperatorsLeaderboard = (first: number = 10, orderBy: OperatorOrderBy = "totalRails") =>
  useGraphQLQuery<OperatorsLeaderboardResponse, Operator[]>({
    queryKey: ["operatorsLeaderboard", first, orderBy],
    query: GET_OPERATORS_LEADERBOARD,
    variables: { first, orderBy },
    select: (data) => data.operators,
    refetchInterval: 60 * 1000,
  });

export default useOperatorsLeaderboard;
