import type { Operator } from "@filecoin-pay/types";
import { GET_OPERATORS_PAGINATED } from "@/services/grapql/queries";
import { useGraphQLInfiniteQuery } from "./useGraphQLQuery";

export interface OperatorsFilter {
  address?: string;
}

interface OperatorsResponse {
  operators: Operator[];
}

interface OperatorsPage {
  operators: Operator[];
  nextPage: number | undefined;
}

const PAGE_SIZE = 20;

const useInfiniteOperators = (filters: OperatorsFilter = {}) => {
  const where: Record<string, unknown> = {};
  if (filters.address) {
    where.address = filters.address;
  }

  return useGraphQLInfiniteQuery<OperatorsResponse, OperatorsPage>({
    queryKey: ["operators", "infinite", filters],
    query: GET_OPERATORS_PAGINATED,
    getVariables: (pageParam) => ({
      first: PAGE_SIZE,
      skip: pageParam,
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "id",
      orderDirection: "desc",
    }),
    select: (data, pageParam) => ({
      operators: data.operators,
      nextPage: data.operators.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
    }),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
};

export default useInfiniteOperators;
