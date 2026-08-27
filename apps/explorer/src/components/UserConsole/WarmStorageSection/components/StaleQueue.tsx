"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Archive } from "lucide-react";
import type { MockDataset } from "../data/mockDatasets";
import { daysInactive, formatUSD, STALE_AFTER_DAYS, wastedSpendUSD } from "../utils/datasetLifecycle";

type StaleQueueProps = {
  datasets: MockDataset[];
  onKeep: (dataset: MockDataset) => void;
  onRelease: (dataset: MockDataset) => void;
};

/**
 * The triage queue the inactive-dataset email lands on: stale datasets ranked
 * by spend since their last activity signal. Ranking uses last write for
 * datasets without FilBeam, retrieval recency where FilBeam data exists — each
 * row names its signal so "inactive" is never overstated.
 *
 * Every row closes with exactly one disposition: Keep (affirm intentional
 * storage, mute inactivity alerts), Export (get the data out), or Release
 * (stop paying). Keep is deliberately not "Extend": funding is account-level
 * in Filecoin Pay, so a per-dataset top-up cannot promise anything.
 */
export const StaleQueue = ({ datasets, onKeep, onRelease }: StaleQueueProps) => {
  const ranked = [...datasets].sort((a, b) => wastedSpendUSD(b) - wastedSpendUSD(a));
  if (ranked.length === 0) return null;

  return (
    <Card className='flex flex-col gap-4 p-4'>
      <div className='flex items-center gap-2.5'>
        <Archive className='size-4 text-muted-foreground' />
        <h3 className='font-medium'>Inactive datasets</h3>
        <span className='text-sm text-muted-foreground'>
          No activity for {STALE_AFTER_DAYS}+ days, ranked by spend since then
        </span>
      </div>

      <ul className='flex flex-col divide-y'>
        {ranked.map((dataset) => (
          <li key={dataset.id} className='flex flex-wrap items-center justify-between gap-3 py-3'>
            <div className='flex min-w-0 flex-col'>
              <span className='truncate font-medium'>{dataset.name}</span>
              <span className='text-xs text-muted-foreground'>
                {dataset.retrieval ? "Last retrieved" : "Last write (retrieval not visible without FilBeam)"}{" "}
                {daysInactive(dataset)} days ago · {formatUSD(wastedSpendUSD(dataset))} spent since
              </span>
            </div>
            <div className='flex shrink-0 gap-2' data-tour='dispositions'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant='ghost' onClick={() => onKeep(dataset)}>
                    Keep
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='top'>
                  Marks this dataset as intentionally stored and mutes inactivity alerts for it.
                </TooltipContent>
              </Tooltip>
              <Button variant='ghost'>Export</Button>
              <Button variant='ghost' className='text-destructive' onClick={() => onRelease(dataset)}>
                Release
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
