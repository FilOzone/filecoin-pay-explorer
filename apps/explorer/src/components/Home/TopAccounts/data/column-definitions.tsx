import type { Account } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CopyableText } from "@/components/shared";
import { formatCompactNumber } from "@/utils/formatter";

const columnHelper = createColumnHelper<Account>();

export const columns = [
  columnHelper.display({
    id: "rank",
    header: "#",
    cell: (info) => <span className='font-semibold text-muted-foreground'>{info.row.index + 1}</span>,
    size: 48,
  }),
  columnHelper.accessor("address", {
    header: "Address",
    cell: (info) => (
      <CopyableText
        value={info.getValue()}
        to={`/account/${info.getValue()}`}
        monospace={true}
        label='Account address'
        truncate={true}
        truncateLength={8}
      />
    ),
  }),
  columnHelper.accessor("totalRails", {
    header: "Total Rails",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("totalTokens", {
    header: "Total Tokens",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("totalApprovals", {
    header: () => (
      <div className='flex items-center gap-1.5'>
        Total Approvals
        <Tooltip>
          <TooltipTrigger asChild>
            <button type='button' className='inline-flex'>
              <Info className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            How many payment managers this account has given permission to use their tokens
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
];
