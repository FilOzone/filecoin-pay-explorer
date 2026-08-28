"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import type { Network } from "@/types";
import { TerminateButton } from "../components/TerminateButton";
import { formatDaysAgo, formatUSD } from "../utils/datasetLifecycle";
import type { MockDataset } from "./mockDatasets";

const columnHelper = createColumnHelper<MockDataset>();

// Proving detail lives in the PDP Explorer rather than duplicated here.
const pdpExplorerDatasetUrl = (network: Network, datasetId: string): string =>
  `https://pdp.filecoin.cloud/${network}/dataset/${datasetId}`;

export const buildDatasetColumns = (onTerminate: (dataset: MockDataset) => void, network: Network) => [
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
    cell: (info) => {
      const ops = info.row.original.oneTimeOpsUSD;
      return (
        <div className='flex flex-col'>
          <span className='tabular-nums'>{formatUSD(info.getValue() * 30)}</span>
          {ops > 0 ? (
            <span className='text-xs text-muted-foreground tabular-nums'>+ {formatUSD(ops)} ops (30d)</span>
          ) : null}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "proving",
    header: "Proving",
    cell: (info) => (
      <a
        href={pdpExplorerDatasetUrl(network, info.row.original.id)}
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
    cell: (info) => <TerminateButton onClick={() => onTerminate(info.row.original)} />,
  }),
];
