import type { Operator } from "@filecoin-pay/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_OPERATORS_PAGINATED } from "@/services/grapql/queries";

export interface OperatorsFilter {
  address?: string;
}

interface GetOperatorsResponse {
  operators: Operator[];
}

const PAGE_SIZE = 20;

const useInfiniteOperators = (filters: OperatorsFilter = {}) => {
  return useInfiniteQuery({
    queryKey: ["operators", "infinite", filters],
    queryFn: async ({ pageParam = 0 }) => {
      const where: Record<string, unknown> = {};

      if (filters.address) {
        where.address = filters.address;
      }

      const response = await executeQuery<GetOperatorsResponse>(GET_OPERATORS_PAGINATED, {
        first: PAGE_SIZE,
        skip: pageParam,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: "id",
        orderDirection: "desc",
      });

      return {
        operators: response.operators,
        nextPage: response.operators.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteOperators;
