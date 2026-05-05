import type { OperatorToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { ExplorerLink } from "@/components/shared";
import { formatCompactNumber, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<OperatorToken>();

export const columns = [
  columnHelper.display({
    id: "rank",
    header: "#",
    cell: (info) => <span className='font-semibold text-muted-foreground'>{info.row.index + 1}</span>,
    size: 48,
  }),
  columnHelper.accessor("operator.address", {
    header: "Address",
    cell: (info) => {
      return <ExplorerLink address={info.getValue()} label='Service address' />;
    },
  }),
  columnHelper.accessor(
    (row) => ({
      settledAmount: row.settledAmount,
      token: row.token,
    }),
    {
      id: "usdfcSettled",
      header: "USDFC settled",
      cell: (info) => {
        const { settledAmount, token } = info.getValue();
        return formatToken(settledAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor("operator.totalRails", {
    header: "Total Rails",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("operator.totalTokens", {
    header: "Total Tokens",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("operator.totalApprovals", {
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
            How many accounts have given this payment manager permission to handle their payments
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
];
