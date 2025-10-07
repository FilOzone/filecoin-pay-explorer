import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "../../config/graphql";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const executeQuery = async <T>(query: string, variables?: Record<string, any>): Promise<T> =>
  graphqlClient.request<T>(query, variables);
