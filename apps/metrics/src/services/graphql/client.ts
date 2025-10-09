import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "../../config/graphql";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

// biome-ignore lint/suspicious/noExplicitAny: GraphQL variables can be of any type
export const executeQuery = async <T>(query: string, variables?: Record<string, any>): Promise<T> =>
  graphqlClient.request<T>(query, variables);
