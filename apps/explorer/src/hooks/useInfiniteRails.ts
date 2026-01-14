import type { Rail } from "@filecoin-pay/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { GET_RAILS_PAGINATED } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface RailsFilter {
  railId?: string;
  payer?: string;
  payee?: string;
  operator?: string;
  state?: string;
}

interface GetRailsResponse {
  rails: Rail[];
}

const PAGE_SIZE = 20;

const useInfiniteRails = (filters: RailsFilter = {}) => {
  const { executeQuery, network } = useGraphQLQuery();

  return useInfiniteQuery({
    queryKey: ["rails", "infinite", filters, network],
    queryFn: async ({ pageParam = 0 }) => {
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

      const response = await executeQuery<GetRailsResponse>(GET_RAILS_PAGINATED, {
        first: PAGE_SIZE,
        skip: pageParam,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: "createdAt",
        orderDirection: "desc",
      });

      return {
        rails: response.rails,
        nextPage: response.rails.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteRails;
