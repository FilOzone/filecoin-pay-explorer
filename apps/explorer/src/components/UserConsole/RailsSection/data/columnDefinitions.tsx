import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText, RailStateBadge } from "@/components/shared";
import { formatDate, formatEpochDuration, formatToken } from "@/utils/formatter";
import { RailActions } from "../components";
import type { RailTableRow } from "../types";

// Create column helper
const columnHelper = createColumnHelper<RailTableRow>();

export const columns = [
  columnHelper.accessor("railId", {
    id: "railId",
    header: "Rail ID",
    cell: (info) => {
      const railId = info.getValue();
      return (
        // TODO: add styled link when per rail page is ready
        <ID number={Number(railId)} />
      );
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Date",
    cell: (info) => formatDate(info.getValue()),
  }),
  // The route fixes the payer and the operator, so the payee is the only
  // participant worth a column.
  columnHelper.display({
    id: "payee",
    header: "Payee",
    cell: (info) => {
      const { payee } = info.row.original;

      return (
        <CopyableText
          className='text-sm font-medium'
          value={payee.address}
          to={`/accounts/${payee.address}`}
          monospace={true}
          label='Account address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.display({
    id: "payment",
    header: () => <div className='text-right'>Payment Rate/day</div>,
    cell: (info) => {
      const rail = info.row.original;
      const railRatePerDay = BigInt(rail.paymentRate) * TIME_CONSTANTS.EPOCHS_PER_DAY;
      return (
        <div className='flex flex-col gap-1 text-right'>
          <div className='font-medium text-sm tabular-nums'>
            {formatToken(railRatePerDay, rail.token.decimals, rail.token.symbol, 12)}
          </div>
          <div className='text-xs text-muted-foreground'>
            Settled: {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
          </div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "state",
    header: "State",
    cell: (info) => {
      const rail = info.row.original;
      return (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <RailStateBadge state={rail.state} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex makes the tooltip trigger keyboard-focusable */}
              <span tabIndex={0} className='w-fit cursor-help text-xs text-muted-foreground'>
                Lockup: {formatEpochDuration(rail.lockupPeriod)}
              </span>
            </TooltipTrigger>
            <TooltipContent side='top'>{rail.lockupPeriod.toString()} epochs</TooltipContent>
          </Tooltip>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: (info) => <RailActions rail={info.row.original} />,
  }),
];
