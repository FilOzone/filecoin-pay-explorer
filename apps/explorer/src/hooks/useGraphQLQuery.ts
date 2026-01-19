import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

export interface UseGraphQLInfiniteQueryOptions<TData, TResult> {
  networkOverride?: Network;
  query: string;
  queryKey: readonly unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
  getVariables: (pageParam: number) => Record<string, any>;
  select: (data: TData, pageParam: number) => TResult;
  getNextPageParam: (lastPage: TResult) => number | undefined;
  initialPageParam?: number;
}

export function useGraphQLInfiniteQuery<TData, TResult>(options: UseGraphQLInfiniteQueryOptions<TData, TResult>) {
  const { network: contextNetwork } = useNetwork();

  const network = options.networkOverride ?? contextNetwork;
  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  return useInfiniteQuery({
    queryKey: [...options.queryKey, network] as const,
    queryFn: async ({ pageParam }) => {
      const variables = options.getVariables(pageParam);
      const data = await request<TData>(subgraphUrl, options.query, variables);
      return options.select(data, pageParam);
    },
    getNextPageParam: options.getNextPageParam,
    initialPageParam: options.initialPageParam ?? 0,
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
