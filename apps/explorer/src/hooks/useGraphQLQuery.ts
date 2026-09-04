import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { request } from "graphql-request";
import { useMemo } from "react";
import type { Network } from "@/types";
import { getSubgraphUrl } from "@/utils/network";
import useNetwork from "./useNetwork";

export interface UseGraphQLQueryOptions<TData, TResult = TData> {
  networkOverride?: Network;
  query: string;
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
  variables?: Record<string, any>;
  queryKey: readonly unknown[];
  select?: (data: TData) => TResult;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useGraphQLQuery<TData, TResult = TData>(options: UseGraphQLQueryOptions<TData, TResult>) {
  const { network: contextNetwork } = useNetwork();

  const network = options.networkOverride ?? contextNetwork;
  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  return useQuery({
    queryKey: [...options.queryKey, network] as const,
    queryFn: async () => {
      return request<TData>(subgraphUrl, options.query, options.variables);
    },
    select: options.select,
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  });
}

/**
 * `TPageParam` defaults to a numeric `skip` offset. Cursor-paginated queries
 * pass the cursor's own type instead — for entities ordered by `id`, a string.
 */
export interface UseGraphQLInfiniteQueryOptions<TData, TResult, TPageParam> {
  networkOverride?: Network;
  query: string;
  queryKey: readonly unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
  getVariables: (pageParam: TPageParam) => Record<string, any>;
  select: (data: TData, pageParam: TPageParam) => TResult;
  getNextPageParam: (lastPage: TResult) => TPageParam | undefined;
  initialPageParam: TPageParam;
}

export function useGraphQLInfiniteQuery<TData, TResult, TPageParam = number>(
  options: UseGraphQLInfiniteQueryOptions<TData, TResult, TPageParam>,
) {
  const { network: contextNetwork } = useNetwork();

  const network = options.networkOverride ?? contextNetwork;
  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  return useInfiniteQuery<TResult, Error, InfiniteData<TResult, TPageParam>, readonly unknown[], TPageParam>({
    queryKey: [...options.queryKey, network],
    queryFn: async (context) => {
      // React Query hands the query function a `QueryFunctionContext` whose
      // `pageParam` is `unknown`. It only ever holds what `initialPageParam` and
      // `getNextPageParam` produced, both of which are `TPageParam`.
      const pageParam = context.pageParam as TPageParam;
      const variables = options.getVariables(pageParam);
      const data = await request<TData>(subgraphUrl, options.query, variables);
      return options.select(data, pageParam);
    },
    getNextPageParam: options.getNextPageParam,
    initialPageParam: options.initialPageParam,
  });
}

export interface UseGraphQLClientOptions {
  networkOverride?: Network;
}

export function useGraphQLClient(options?: UseGraphQLClientOptions) {
  const { network: contextNetwork } = useNetwork();

  const network = options?.networkOverride ?? contextNetwork;
  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  const executeQuery = async <T>(
    query: string,
    // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
    variables?: Record<string, any>,
  ): Promise<T> => {
    return request<T>(subgraphUrl, query, variables);
  };

  return { executeQuery, network };
}
