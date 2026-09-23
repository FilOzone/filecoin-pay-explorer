import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import { getChain } from "@/constants/chains";
import { useMutedDataSets } from "@/hooks/useMutedDataSets";
import { useStaleDataSets } from "@/hooks/useStaleDataSets";
import type { Network } from "@/types";
import { StaleQueueErrorState, StaleQueueLayout, StaleQueueLoadingState, StaleQueueRow } from "./components";
import { wastedSpend } from "./data/staleness";

/** The queue ranks candidates but only ever surfaces the worst offenders. */
const QUEUE_SIZE = 10;

/** Descending by spend. */
function byDescendingSpend(a: { spend: bigint }, b: { spend: bigint }): number {
  if (a.spend === b.spend) return 0;
  return b.spend > a.spend ? 1 : -1;
}

interface StaleQueueProps {
  /** The connected payer. Every dataset ranked here has this account as its payer. */
  accountId: string;
  network: Network;
}

/**
 * Triage queue for stale Warm Storage datasets: ranked by money spent since
 * they went quiet, with Keep (mute) and a stubbed Terminate. Renders nothing
 * once loaded when nothing is stale, matching the issue's own merge note.
 */
export const StaleQueue: React.FC<StaleQueueProps> = ({ accountId, network }) => {
  const { data: dataSets, isLoading, isError } = useStaleDataSets(accountId, { networkOverride: network });
  const { data: mutedIds } = useMutedDataSets(accountId);

  const chain = useMemo(() => getChain(network), [network]);
  const { data: currentEpoch } = useBlockNumber({ chainId: chain.id, watch: true });

  if (isLoading) {
    return (
      <StaleQueueLayout>
        <StaleQueueLoadingState />
      </StaleQueueLayout>
    );
  }

  if (isError) {
    return (
      <StaleQueueLayout>
        <StaleQueueErrorState />
      </StaleQueueLayout>
    );
  }

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  const ranked = (dataSets ?? [])
    .filter((dataSet) => !mutedIds?.has(dataSet.dataSetId.toString()))
    .map((dataSet) => ({ dataSet, spend: wastedSpend(dataSet, currentEpoch, nowSeconds) ?? 0n }))
    .sort(byDescendingSpend)
    .slice(0, QUEUE_SIZE);

  if (ranked.length === 0) {
    return null;
  }

  return (
    <StaleQueueLayout>
      <ul className='flex flex-col divide-y'>
        {ranked.map(({ dataSet, spend }) => (
          <StaleQueueRow
            key={dataSet.id}
            dataSet={dataSet}
            accountId={accountId}
            spend={spend}
            nowSeconds={nowSeconds}
          />
        ))}
      </ul>
    </StaleQueueLayout>
  );
};
