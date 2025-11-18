import type { Operator } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CopyableText } from "@/components/shared";
import { formatCompactNumber } from "@/utils/formatter";

const columnHelper = createColumnHelper<Operator>();

export const columns = [
  columnHelper.accessor("address", {
    header: "Address",
    cell: (info) => {
      const address = info.getValue();
      return (
        <CopyableText
          value={address}
          to={`/operator/${address}`}
          monospace={true}
          label='Service address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("totalRails", {
    header: () => <div className='text-right'>Total Rails</div>,
    cell: (info) => <div className='text-right'>{formatCompactNumber(info.getValue())}</div>,
  }),
  columnHelper.accessor("totalTokens", {
    header: () => <div className='text-right'>Total Tokens</div>,
    cell: (info) => <div className='text-right'>{formatCompactNumber(info.getValue())}</div>,
  }),
  columnHelper.accessor("totalApprovals", {
    header: () => (
      <div className='flex items-center justify-end gap-1.5'>
        Total Approvals
        <Tooltip delayDuration={300}>
          <TooltipTrigger className='inline-flex items-center cursor-help'>
            <Info className='h-3.5 w-3.5 text-muted-foreground' />
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            How many accounts have given this payment manager permission to handle their payments
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => <div className='text-right'>{formatCompactNumber(info.getValue())}</div>,
  }),
];
