import type { Rail } from "@filecoin-pay/types";
import { GET_RAILS_PAGINATED } from "@/services/grapql/queries";
import { useGraphQLInfiniteQuery } from "./useGraphQLQuery";

export interface RailsFilter {
  railId?: string;
  payer?: string;
  payee?: string;
  operator?: string;
  state?: string;
}

interface RailsResponse {
  rails: Rail[];
}

interface RailsPage {
  rails: Rail[];
  nextPage: number | undefined;
}

const PAGE_SIZE = 20;

const useInfiniteRails = (filters: RailsFilter = {}) => {
  const where: Record<string, unknown> = {};
  if (filters.railId) {
    where.railId = filters.railId;
  }
  if (filters.payer) {
    where.payer = filters.payer;
  }
  if (filters.payee) {
    where.payee = filters.payee;
  }
  if (filters.operator) {
    where.operator = filters.operator;
  }
  if (filters.state) {
    where.state = filters.state;
  }

  return useGraphQLInfiniteQuery<RailsResponse, RailsPage>({
    queryKey: ["rails", "infinite", filters],
    query: GET_RAILS_PAGINATED,
    getVariables: (pageParam) => ({
      first: PAGE_SIZE,
      skip: pageParam,
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "createdAt",
      orderDirection: "desc",
    }),
    select: (data, pageParam) => ({
      rails: data.rails,
      nextPage: data.rails.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
    }),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteRails;
