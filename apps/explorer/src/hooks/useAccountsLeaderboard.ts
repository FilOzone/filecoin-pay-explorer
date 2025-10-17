import type { Account } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_ACCOUNTS_LEADERBOARD } from "@/services/grapql/queries";

export interface IAccountsLeaderboard {
  accounts: Account[];
}

export type AccountOrderBy = "totalRails" | "totalTokens" | "totalApprovals";

const useAccountsLeaderboard = (first: number = 10, orderBy: AccountOrderBy = "totalRails") =>
  useQuery({
    queryKey: ["accountsLeaderboard", first, orderBy],
    queryFn: async () => {
      const response = await executeQuery<IAccountsLeaderboard>(GET_ACCOUNTS_LEADERBOARD, { first, orderBy });
      return response.accounts;
    },
    refetchInterval: 60 * 1000,
  });

export default useAccountsLeaderboard;
