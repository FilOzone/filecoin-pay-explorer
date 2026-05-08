import type { Address, UserToken } from "@filecoin-pay/types";
import { GET_ACCOUNTS_LEADERBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface AccountsLeaderboardResponse {
  topEarners: UserToken[];
  topSpenders: UserToken[];
}

interface AccountsLeaderboardData {
  topEarners: UserToken[];
  topSpenders: UserToken[];
}

const useAccountsLeaderboard = (first: number = 10, token: Address) =>
  useGraphQLQuery<AccountsLeaderboardResponse, AccountsLeaderboardData>({
    queryKey: ["accountsLeaderboard", first, token],
    query: GET_ACCOUNTS_LEADERBOARD,
    variables: { first, token },
    select: (data) => ({
      topEarners: data.topEarners,
      topSpenders: data.topSpenders,
    }),
    refetchInterval: 60 * 1000,
  });

export default useAccountsLeaderboard;
