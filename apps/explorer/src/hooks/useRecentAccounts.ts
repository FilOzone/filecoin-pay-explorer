import type { Account } from "@filecoin-pay/types";
import { GET_RECENT_ACCOUNTS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface RecentAccountsResponse {
  accounts: Account[];
}

const useRecentAccounts = (first: number = 10) =>
  useGraphQLQuery<RecentAccountsResponse, Account[]>({
    queryKey: ["recentAccounts", first],
    query: GET_RECENT_ACCOUNTS,
    variables: { first },
    select: (data) => data.accounts,
    refetchInterval: 60 * 1000,
  });

export default useRecentAccounts;
