import type { Account } from "@filecoin-pay/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_ACCOUNTS_PAGINATED } from "@/services/grapql/queries";

export interface AccountsFilter {
  address?: string;
}

interface GetAccountsResponse {
  accounts: Account[];
}

const PAGE_SIZE = 20;

const useInfiniteAccounts = (filters: AccountsFilter = {}) => {
  return useInfiniteQuery({
    queryKey: ["accounts", "infinite", filters],
    queryFn: async ({ pageParam = 0 }) => {
      const where: Record<string, unknown> = {};

      if (filters.address) {
        where.address = filters.address;
      }

      const response = await executeQuery<GetAccountsResponse>(GET_ACCOUNTS_PAGINATED, {
        first: PAGE_SIZE,
        skip: pageParam,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: "id",
        orderDirection: "desc",
      });

      return {
        accounts: response.accounts,
        nextPage: response.accounts.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteAccounts;
