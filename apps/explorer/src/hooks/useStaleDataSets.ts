import type { DataSet } from "@filecoin-pay/types";
import { STALE_AFTER_DAYS } from "@/components/UserConsole/StaleQueue/data/staleness";
import { GET_STALE_DATA_SETS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLQuery } from "./useGraphQLQuery";

/**
 * Stale-first candidates for the triage queue. Bounded, unpaginated: the
 * queue only ever shows a short ranked list, not every stale dataset a payer
 * has, so one capped fetch is enough to rank from.
 */

const STALE_CANDIDATES_LIMIT = 50;

interface StaleDataSetsResponse {
  dataSets: DataSet[];
}

interface StaleDataSetsOptions {
  networkOverride?: Network;
}

export const useStaleDataSets = (accountId: string, options?: StaleDataSetsOptions) =>
  useGraphQLQuery<StaleDataSetsResponse, DataSet[]>({
    queryKey: ["account", accountId, "staleDataSets"],
    query: GET_STALE_DATA_SETS,
    variables: {
      payer: accountId.toLowerCase(),
      before: (Math.floor(Date.now() / 1000) - STALE_AFTER_DAYS * 86_400).toString(),
      first: STALE_CANDIDATES_LIMIT,
    },
    select: (data) => data.dataSets,
    enabled: !!accountId,
    networkOverride: options?.networkOverride,
  });
