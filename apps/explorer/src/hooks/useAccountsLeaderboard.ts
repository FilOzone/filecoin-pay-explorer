import type { Account } from "@filecoin-pay/types";
import { GET_ACCOUNTS_LEADERBOARD } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface AccountsLeaderboardResponse {
  accounts: Account[];
}

export type AccountOrderBy = "totalRails" | "totalTokens" | "totalApprovals";

const useAccountsLeaderboard = (first: number = 10, orderBy: AccountOrderBy = "totalRails") =>
  useGraphQLQuery<AccountsLeaderboardResponse, Account[]>({
    queryKey: ["accountsLeaderboard", first, orderBy],
    query: GET_ACCOUNTS_LEADERBOARD,
    variables: { first, orderBy },
    select: (data) => data.accounts,
    refetchInterval: 60 * 1000,
  });

export default useAccountsLeaderboard;
