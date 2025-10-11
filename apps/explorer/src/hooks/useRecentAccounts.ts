import type { Account } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_RECENT_ACCOUNTS } from "@/services/grapql/queries";

export interface IRecentAccounts {
  accounts: Account[];
}

const useRecentAccounts = (first: number = 10) =>
  useQuery({
    queryKey: ["recentAccounts", first],
    queryFn: async () => {
      const response = await executeQuery<IRecentAccounts>(GET_RECENT_ACCOUNTS, { first });
      return response.accounts;
    },
    refetchInterval: 60 * 1000,
  });

export default useRecentAccounts;
