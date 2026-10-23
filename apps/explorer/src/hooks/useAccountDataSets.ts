import type { DataSet } from "@filecoin-pay/types";
import { GET_ACCOUNT_DATA_SETS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLQuery } from "./useGraphQLQuery";

const ACCOUNT_DATA_SETS_PAGE_SIZE = 10;

interface AccountDataSetsResponse {
  dataSets: DataSet[];
}

type AccountDataSetsPage = {
  dataSets: DataSet[];
  /** A row beyond this page came back, so the next page has at least one. */
  hasMore: boolean;
};

interface AccountDataSetsOptions {
  networkOverride?: Network;
}

/** A payer's Warm Storage datasets; the subgraph indexes one FWSS deployment, so payer alone scopes it. */
export const useAccountDataSets = (accountId: string, page: number, options?: AccountDataSetsOptions) =>
  useGraphQLQuery<AccountDataSetsResponse, AccountDataSetsPage>({
    queryKey: ["account", accountId, "dataSets", page],
    query: GET_ACCOUNT_DATA_SETS,
    variables: {
      payer: accountId.toLowerCase(),
      // One extra row tells a full last page apart from one with more after it.
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
