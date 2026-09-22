import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { DataSet } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CopyableText, StyledLink } from "@/components/shared";
import type { Network } from "@/types";
import { formatBytes, formatDate, formatTokenCeiling } from "@/utils/formatter";
import { monthlyDataSetSpend } from "./monthlySpend";

const columnHelper = createColumnHelper<DataSet>();

/** PDP Explorer indexes datasets by the same id FWSS assigns, under the same network names this app uses. */
const pdpExplorerUrl = (network: Network, dataSetId: bigint) =>
  `https://pdp.filecoin.cloud/${network}/dataset/${dataSetId}`;

export const getDatasetColumns = (network: Network, currentEpoch: bigint | undefined) => [
  columnHelper.accessor("dataSetId", {
    id: "dataSetId",
    header: "ID",
    cell: (info) => <ID number={Number(info.getValue())} />,
  }),
  columnHelper.display({
    id: "provider",
    header: "Provider",
    cell: (info) => {
      const { provider } = info.row.original;
      return (
        <CopyableText
          className='text-sm font-medium'
          value={provider}
          to={`/accounts/${provider}`}
          networkOverride={network}
          monospace={true}
          label='Provider address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("totalSize", {
    id: "totalSize",
    header: () => <div className='text-right'>Size</div>,
    cell: (info) => <div className='text-right text-sm tabular-nums'>{formatBytes(info.getValue())}</div>,
  }),
  columnHelper.accessor("lastWriteAt", {
    id: "lastWriteAt",
    header: "Last Write",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "monthlySpend",
    header: () => (
      <div className='flex items-center justify-end gap-1.5'>
        Monthly Spend
        <Tooltip delayDuration={300}>
          <TooltipTrigger className='inline-flex items-center cursor-help' aria-label='Explain monthly spend'>
            <Info className='h-3.5 w-3.5 text-muted-foreground' />
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            Projected cost over the next 30 days at each rail's current rate, not a historical total.
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => {
      const dataSet = info.row.original;
      const { token } = dataSet.pdpRail;
      const monthlySpend = monthlyDataSetSpend(dataSet, currentEpoch);
      return (
        <div className='text-right font-medium text-sm tabular-nums'>
          {monthlySpend === undefined ? "—" : formatTokenCeiling(monthlySpend, token.decimals, token.symbol, 4)}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "provingStatus",
    header: "Proving",
    cell: (info) => (
      <StyledLink
        href={pdpExplorerUrl(network, info.row.original.dataSetId)}
        external={true}
        showExternalIcon={true}
        className='text-sm'
      >
        PDP Explorer
      </StyledLink>
    ),
  }),
];
