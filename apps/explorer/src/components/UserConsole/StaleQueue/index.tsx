import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  /** The wallet is on a Filecoin chain, so a mute's SIWE message carries the chain the API verifies against. */
  isFilecoinChain: boolean;
}

/**
 * Triage queue for stale Warm Storage datasets: ranked by monthly spend times
 * days inactive, with Keep (snooze) and a stubbed Terminate. Hidden while
 * loading and when nothing is stale.
 */
export const StaleQueue: React.FC<StaleQueueProps> = ({ accountId, network, isFilecoinChain }) => {
  // Null until the reader picks a page, so a linked dataset can choose it.
  const [page, setPage] = useState<number | null>(null);
  // Inactivity emails link to `?dataset=<id>#stale`.
  const linkedDataSetId = useSearchParams().get("dataset");

  // The notifications API serves a single network, so mutes only exist there.
  const hasMutes = isNotificationsEligibleNetwork(network) && Boolean(process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL);
  // Reading mutes needs no signature, so only Keep waits for the wallet to be back on a Filecoin chain.
  const canMute = hasMutes && isFilecoinChain;

  const staleDataSets = useStaleDataSets(accountId, { networkOverride: network });
  const mutedDataSets = useMutedDataSets(hasMutes ? accountId : undefined);

  const staleList = staleDataSets.data?.dataSets;
  const mutedIds = mutedDataSets.data;
  const unmuted = useMemo(
    () => (staleList ?? []).filter((dataSet) => !mutedIds?.has(dataSet.dataSetId.toString())),
    [staleList, mutedIds],
  );
  const { data: currentEpoch } = useBlockNumber({ chainId: getChain(network).id, watch: true });
  // Up to 10,000 rows, so rank only when the list or epoch changes; days inactive refresh with them.
  const ranked = useMemo(
    () => rankStaleDataSets(unmuted, currentEpoch, BigInt(Math.floor(Date.now() / 1000))),
    [unmuted, currentEpoch],
  );

  // Waiting for mutes too keeps muted rows from flashing in.
  const isLoading = staleDataSets.isLoading || mutedDataSets.isLoading;

  const linkedIndex = useMemo(
    () =>
      linkedDataSetId === null
        ? -1
        : ranked.findIndex((entry) => entry.dataSet.dataSetId.toString() === linkedDataSetId),
    [ranked, linkedDataSetId],
  );

  // The queue renders after its data loads, too late for the browser's own jump to #stale.
  const hasRows = !isLoading && ranked.length > 0;
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!hasRows || hasScrolled.current || window.location.hash !== "#stale") return;
    hasScrolled.current = true;
    const target = document.getElementById(`stale-dataset-${linkedDataSetId}`) ?? document.getElementById("stale");
    target?.scrollIntoView({ block: "center" });
  }, [hasRows, linkedDataSetId]);

  if (isLoading) {
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

  if (ranked.length === 0) {
    return null;
  }

  // Keeping the last row of the last page shrinks the page count under `page`.
  const pageCount = Math.ceil(ranked.length / PAGE_SIZE);
  const linkedPage = linkedIndex === -1 ? 1 : Math.floor(linkedIndex / PAGE_SIZE) + 1;
  const currentPage = Math.min(page ?? linkedPage, pageCount);
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
          <StaleQueueRow
            key={entry.dataSet.id}
            {...entry}
            accountId={accountId}
            canMute={canMute && !mutesFailed}
            isLinked={entry.dataSet.dataSetId.toString() === linkedDataSetId}
          />
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
