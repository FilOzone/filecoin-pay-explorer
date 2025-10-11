import { GraphQLClient } from "graphql-request";

export const graphqlClient = new GraphQLClient(import.meta.env.VITE_GRAPHQL_ENDPOINT);

export const executeQuery = async <T>(
  query: string,
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
  variables?: Record<string, any>,
): Promise<T> => graphqlClient.request<T>(query, variables);
