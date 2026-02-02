import type { Account } from "@filecoin-pay/types";
import { GET_ACCOUNTS_PAGINATED } from "@/services/grapql/queries";
import { useGraphQLInfiniteQuery } from "./useGraphQLQuery";

export interface AccountsFilter {
  address?: string;
}

interface AccountsResponse {
  accounts: Account[];
}

interface AccountsPage {
  accounts: Account[];
  nextPage: number | undefined;
}

const PAGE_SIZE = 20;

const useInfiniteAccounts = (filters: AccountsFilter = {}) => {
  const where: Record<string, unknown> = {};
  if (filters.address) {
    where.address = filters.address;
  }

  return useGraphQLInfiniteQuery<AccountsResponse, AccountsPage>({
    queryKey: ["accounts", "infinite", filters],
    query: GET_ACCOUNTS_PAGINATED,
    getVariables: (pageParam) => ({
      first: PAGE_SIZE,
      skip: pageParam,
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "id",
      orderDirection: "desc",
    }),
    select: (data, pageParam) => ({
      accounts: data.accounts,
      nextPage: data.accounts.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
    }),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteAccounts;
