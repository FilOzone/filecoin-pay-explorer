import { request } from "graphql-request";
import { useCallback, useMemo } from "react";
import type { Network } from "@/types";
import { getSubgraphUrl } from "@/utils/network";
import useNetwork from "./useNetwork";

export interface UseGraphQLQueryOptions {
  networkOverride?: Network;
}

export function useGraphQLQuery(options?: UseGraphQLQueryOptions) {
  const { network: contextNetwork } = useNetwork();

  const network = options?.networkOverride ?? contextNetwork;

  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  const executeQuery = useCallback(
    async <T>(
      query: string,
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
      variables?: Record<string, any>,
    ): Promise<T> => {
      return request<T>(subgraphUrl, query, variables);
    },
    [subgraphUrl],
  );

  return { executeQuery, network };
}
