"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { formatDaysAgo, formatUSD } from "../utils/datasetLifecycle";
import type { MockDataset } from "./mockDatasets";

const columnHelper = createColumnHelper<MockDataset>();

// Proving detail lives in the PDP Explorer rather than duplicated here.
// TODO(POC): real per-dataset deep link once the PDP Explorer URL shape is confirmed.
const PDP_EXPLORER_URL = "https://pdp.vxb.ai";

export const buildDatasetColumns = (onTerminate: (dataset: MockDataset) => void) => [
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
  columnHelper.accessor("burnPerDayUSD", {
    header: "Spend / mo",
    cell: (info) => <span className='tabular-nums'>{formatUSD(info.getValue() * 30)}</span>,
  }),
  columnHelper.display({
    id: "proving",
    header: "Proving",
    cell: () => (
      <a
        href={PDP_EXPLORER_URL}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex items-center gap-1 text-sm text-primary hover:underline'
      >
        PDP Explorer
        <ExternalLink className='size-3.5' />
      </a>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => (
      <Button variant='ghost' className='text-destructive' onClick={() => onTerminate(info.row.original)}>
        Terminate
      </Button>
    ),
  }),
];
