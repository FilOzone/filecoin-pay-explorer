import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { ListPagination } from "@/components/shared/ListPagination";
import { getChain } from "@/constants/chains";
import { useMutedDataSets } from "@/hooks/useMutedDataSets";
import { useStaleDataSets } from "@/hooks/useStaleDataSets";
import type { Network } from "@/types";
import { isNotificationsEligibleNetwork } from "@/utils/network";
import { StaleQueueErrorState, StaleQueueLayout, StaleQueueRow } from "./components";
import { rankStaleDataSets } from "./data/staleness";

const PAGE_SIZE = 10;

interface StaleQueueProps {
  /** The connected payer. Every dataset ranked here has this account as its payer. */
  accountId: string;
  network: Network;
}

/**
 * Triage queue for stale Warm Storage datasets: ranked by monthly spend times
 * days inactive, with Keep (snooze) and a stubbed Terminate. Hidden while
 * loading and when nothing is stale.
 */
export const StaleQueue: React.FC<StaleQueueProps> = ({ accountId, network }) => {
  const [page, setPage] = useState(1);

  // The notifications API serves a single network, so mutes only exist there.
  const canMute = isNotificationsEligibleNetwork(network) && Boolean(process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL);

  const staleDataSets = useStaleDataSets(accountId, { networkOverride: network });
  const mutedDataSets = useMutedDataSets(canMute ? accountId : undefined);
  const { data: currentEpoch } = useBlockNumber({ chainId: getChain(network).id, watch: true });

  // Waiting for mutes too keeps muted rows from flashing in.
  if (staleDataSets.isLoading || mutedDataSets.isLoading) {
    return null;
  }

  if (staleDataSets.isError) {
    return (
      <StaleQueueLayout>
        <StaleQueueErrorState />
      </StaleQueueLayout>
    );
  }

  // Without the mutes, already-kept rows can't be told apart, so Keep would let them be kept again.
  const mutesFailed = mutedDataSets.isError;
  const unmuted = (staleDataSets.data?.dataSets ?? []).filter(
    (dataSet) => !mutedDataSets.data?.has(dataSet.dataSetId.toString()),
  );
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const ranked = rankStaleDataSets(unmuted, currentEpoch, nowSeconds);

  if (ranked.length === 0) {
    return null;
  }

  // Keeping the last row of the last page shrinks the page count under `page`.
  const pageCount = Math.ceil(ranked.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount);
  const pageRows = ranked.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <StaleQueueLayout>
      {mutesFailed ? (
        <p role='alert' className='text-sm text-destructive'>
          Couldn't load the datasets you kept, so some below may already be kept. Keep is unavailable until they load.
        </p>
      ) : null}
      <ul className='flex flex-col divide-y'>
        {pageRows.map((entry) => (
          <StaleQueueRow key={entry.dataSet.id} {...entry} accountId={accountId} canMute={canMute && !mutesFailed} />
        ))}
      </ul>
      {pageCount > 1 ? (
        <ListPagination kind='stepped' page={currentPage} hasMore={currentPage < pageCount} onPageChange={setPage} />
      ) : null}
      {staleDataSets.data?.reachedPageLimit ? (
        <p className='text-xs text-muted-foreground'>
          This account has more than 10,000 inactive datasets, counting kept ones. Only the first 10,000 by dataset ID
          are ranked here, so higher-ranked datasets may be missing.
        </p>
      ) : null}
    </StaleQueueLayout>
  );
};
