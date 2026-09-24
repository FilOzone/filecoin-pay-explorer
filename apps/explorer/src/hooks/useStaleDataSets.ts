import type { DataSet } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { STALE_AFTER_DAYS } from "@/components/UserConsole/StaleQueue/data/staleness";
import { GET_STALE_DATA_SETS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { fetchAllPages, SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { useGraphQLClient } from "./useGraphQLQuery";
import useNetwork from "./useNetwork";

/** Up to 10,000 stale datasets. Past that, the queue says the list is incomplete. */
const STALE_MAX_PAGES = 10;

interface StaleDataSetsOptions {
  networkOverride?: Network;
}

/**
 * Every stale dataset of the payer. The queue's rank changes over time, so
 * the subgraph can't sort by it and the whole set is ranked client-side.
 */
export const useStaleDataSets = (accountId: string, options?: StaleDataSetsOptions) => {
  const { network: contextNetwork } = useNetwork();
  const network = options?.networkOverride ?? contextNetwork;
  const { executeQuery } = useGraphQLClient({ networkOverride: options?.networkOverride });

  return useQuery({
    queryKey: ["account", accountId, "staleDataSets", network],
    queryFn: async ({ signal }) => {
      const before = (Math.floor(Date.now() / 1000) - STALE_AFTER_DAYS * 86_400).toString();

      const { items, reachedPageLimit } = await fetchAllPages<DataSet>(async (cursor) => {
        const page = await executeQuery<{ dataSets: DataSet[] }>(
          GET_STALE_DATA_SETS,
          { payer: accountId.toLowerCase(), before, cursor, first: SUBGRAPH_PAGE_SIZE },
          signal,
        );
        return page.dataSets;
      }, STALE_MAX_PAGES);

      return { dataSets: items, reachedPageLimit };
    },
    enabled: !!accountId,
  });
};
