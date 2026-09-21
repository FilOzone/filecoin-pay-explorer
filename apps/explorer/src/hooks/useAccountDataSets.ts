import type { DataSet } from "@filecoin-pay/types";
import { GET_ACCOUNT_DATA_SETS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLQuery } from "./useGraphQLQuery";

/**
 * A payer's Warm Storage datasets. Every dataset the subgraph indexes belongs
 * to the single Warm Storage deployment on the network, so this reads by payer
 * alone; the console only calls it once the route's operator has already been
 * confirmed to be Warm Storage.
 */

export const ACCOUNT_DATA_SETS_PAGE_SIZE = 10;

interface AccountDataSetsResponse {
  dataSets: DataSet[];
}

export type AccountDataSetsPage = {
  dataSets: DataSet[];
  /** A row beyond this page came back, so the next page has at least one. */
  hasMore: boolean;
};

interface AccountDataSetsOptions {
  networkOverride?: Network;
}

export const useAccountDataSets = (accountId: string, page: number = 1, options?: AccountDataSetsOptions) =>
  useGraphQLQuery<AccountDataSetsResponse, AccountDataSetsPage>({
    queryKey: ["account", accountId, "dataSets", page],
    query: GET_ACCOUNT_DATA_SETS,
    variables: {
      payer: accountId.toLowerCase(),
      // One more than a page, so a full page can be told apart from a full page
      // with nothing after it.
      first: ACCOUNT_DATA_SETS_PAGE_SIZE + 1,
      skip: (page - 1) * ACCOUNT_DATA_SETS_PAGE_SIZE,
    },
    select: (data) => ({
      dataSets: data.dataSets.slice(0, ACCOUNT_DATA_SETS_PAGE_SIZE),
      hasMore: data.dataSets.length > ACCOUNT_DATA_SETS_PAGE_SIZE,
    }),
    enabled: !!accountId,
    networkOverride: options?.networkOverride,
  });
