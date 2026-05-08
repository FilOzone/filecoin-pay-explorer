import type { Operator } from "@filecoin-pay/types";
import { getChain } from "@/constants/chains";
import { GET_OPERATORS_PAGINATED } from "@/services/grapql/queries";
import { useGraphQLInfiniteQuery } from "./useGraphQLQuery";
import useNetwork from "./useNetwork";

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
  const { network } = useNetwork();
  const token = getChain(network).contracts.usdfc.address;

  const where: Record<string, unknown> = {};
  if (filters.address) {
    where.address = filters.address;
  }

  return useGraphQLInfiniteQuery<OperatorsResponse, OperatorsPage>({
    queryKey: ["operators", "infinite", filters, token],
    query: GET_OPERATORS_PAGINATED,
    getVariables: (pageParam) => ({
      first: PAGE_SIZE,
      skip: pageParam,
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "id",
      orderDirection: "desc",
      token,
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
