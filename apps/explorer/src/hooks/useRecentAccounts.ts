import type { Account } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { GET_RECENT_ACCOUNTS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface IRecentAccounts {
  accounts: Account[];
}

const useRecentAccounts = (first: number = 10) => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["recentAccounts", first, network],
    queryFn: async () => {
      const response = await executeQuery<IRecentAccounts>(GET_RECENT_ACCOUNTS, { first });
      return response.accounts;
    },
    refetchInterval: 60 * 1000,
  });
};

export default useRecentAccounts;
