"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import { Archive, Bell } from "lucide-react";
import Link from "next/link";
import { PocChip } from "@/components/UserConsole/PocChip";
import type { MockDataset } from "../data/mockDatasets";
import { daysSinceLastWrite, STALE_AFTER_DAYS } from "../utils/datasetLifecycle";
import { TerminateButton } from "./TerminateButton";

type StaleQueueProps = {
  datasets: MockDataset[];
  onTerminate: (dataset: MockDataset) => void;
};

/**
 * The review queue the inactivity email lands on: datasets with no writes for
 * 90+ days, longest-quiet first. A row resolves by terminating the dataset or
 * simply leaving it stored — inactivity is normal for archival data, so the
 * queue asks for attention, not action.
 */
export const StaleQueue = ({ datasets, onTerminate }: StaleQueueProps) => {
  const ranked = [...datasets].sort((a, b) => daysSinceLastWrite(b) - daysSinceLastWrite(a));
  if (ranked.length === 0) return null;

  return (
    <Card className='flex flex-col gap-4 p-4'>
      <div className='flex flex-wrap items-center gap-2.5'>
        <Archive className='size-4 text-muted-foreground' />
        <h3 className='font-medium'>Inactive datasets</h3>
        <span className='text-sm text-muted-foreground'>No writes for {STALE_AFTER_DAYS}+ days</span>
        <PocChip label='mock data' />
        <Link
          href='/console/notifications'
          data-tour='alerts-link'
          className='ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline'
        >
          <Bell className='size-4' />
          Email me when datasets go inactive
        </Link>
      </div>

      <ul className='flex flex-col divide-y'>
        {ranked.map((dataset) => (
          <li key={dataset.id} className='flex flex-wrap items-center justify-between gap-3 py-3'>
            <div className='flex min-w-0 flex-col'>
              <span className='truncate font-medium'>{dataset.name}</span>
              <span className='text-xs text-muted-foreground'>Last write {daysSinceLastWrite(dataset)} days ago</span>
            </div>
            <span className='shrink-0' data-tour='dispositions'>
              <TerminateButton onClick={() => onTerminate(dataset)} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
