import type { OperatorToken } from "@filecoin-pay/types";
import { GET_OPERATORS_LEADERBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface OperatorsLeaderboardResponse {
  operatorTokens: OperatorToken[];
}

const useOperatorsLeaderboard = (first: number = 10, token: string) =>
  useGraphQLQuery<OperatorsLeaderboardResponse, OperatorToken[]>({
    queryKey: ["operatorsLeaderboard", first, token],
    query: GET_OPERATORS_LEADERBOARD,
    variables: { first, token },
    select: (data) => data.operatorTokens,
    refetchInterval: 60 * 1000,
  });

export default useOperatorsLeaderboard;
