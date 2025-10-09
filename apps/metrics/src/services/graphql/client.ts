import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "../../config/graphql";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

export const executeQuery = async <T>(
  query: string,
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
  variables?: Record<string, any>,
): Promise<T> => graphqlClient.request<T>(query, variables);
