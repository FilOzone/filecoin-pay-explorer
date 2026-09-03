"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { createColumnHelper } from "@tanstack/react-table";
import { ProvingBadge, RetrievalBadge } from "../components/DatasetBadges";
import { daysUntil, formatDate, formatDaysAgo, formatUSD } from "../utils/datasetLifecycle";
import type { MockDataset } from "./mockDatasets";

const columnHelper = createColumnHelper<MockDataset>();

const RUNWAY_WARNING_DAYS = 30;
const RUNWAY_CRITICAL_DAYS = 14;

const fundedUntilClassName = (runwayDays: number): string =>
  cn(
    "tabular-nums",
    runwayDays <= RUNWAY_CRITICAL_DAYS && "font-medium text-red-500",
    runwayDays > RUNWAY_CRITICAL_DAYS && runwayDays <= RUNWAY_WARNING_DAYS && "font-medium text-amber-500",
  );

export const buildDatasetColumns = (onRelease: (dataset: MockDataset) => void) => [
  columnHelper.accessor("name", {
    header: "Dataset",
    cell: (info) => (
      <div className='flex min-w-0 flex-col'>
        <span className='truncate font-medium'>{info.getValue()}</span>
        <span className='truncate font-mono text-xs text-muted-foreground'>{info.row.original.rootCid}</span>
      </div>
    ),
  }),
  columnHelper.accessor("sizeGiB", {
    header: "Size",
    cell: (info) => <span className='tabular-nums'>{info.getValue()} GiB</span>,
  }),
  columnHelper.accessor("lastWriteAt", {
    header: "Last write",
    cell: (info) => <span className='tabular-nums'>{formatDaysAgo(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "retrieval",
    header: "Retrieval",
    cell: (info) => <RetrievalBadge dataset={info.row.original} />,
  }),
  columnHelper.accessor("provingStatus", {
    header: "Proving",
    cell: (info) => <ProvingBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("fundedUntil", {
    header: "Funded until",
    cell: (info) => {
      const runwayDays = daysUntil(info.getValue());
      return (
        <div className='flex flex-col'>
          <span className={fundedUntilClassName(runwayDays)}>{formatDate(info.getValue())}</span>
          <span className='text-xs text-muted-foreground'>{runwayDays} days</span>
        </div>
      );
    },
  }),
  columnHelper.accessor("burnPerDayUSD", {
    header: "Spend / mo",
    cell: (info) => <span className='tabular-nums'>{formatUSD(info.getValue() * 30)}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => (
      <Button variant='ghost' className='text-destructive' onClick={() => onRelease(info.row.original)}>
        Release
      </Button>
    ),
  }),
];
