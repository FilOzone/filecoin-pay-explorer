import type { UserToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowDownLeftIcon, ArrowUpRightIcon, InfoIcon } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { formatDate, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<UserToken>();

export const columns = [
  columnHelper.accessor("token.symbol", {
    header: "Token",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor(
    (row) => ({
      funds: row.funds,
      token: row.token,
    }),
    {
      header: "Available Funds",
      cell: (info) => {
        const { funds, token } = info.getValue();
        return formatToken(funds, token.decimals, token.symbol, 5);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      lockupCurrent: row.lockupCurrent,
      token: row.token,
    }),
    {
      header: "Lockup Current",
      cell: (info) => {
        const { lockupCurrent, token } = info.getValue();
        return formatToken(lockupCurrent, token.decimals, token.symbol, 5);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      payout: row.payout,
      token: row.token,
    }),
    {
      id: "payout",
      header: () => (
        <div className='flex items-center gap-1.5'>
          Paid Out
          <Tooltip>
            <TooltipTrigger asChild>
              <button type='button' className='inline-flex'>
                <InfoIcon className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs'>
              Total amount paid for services
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: (info) => {
        const { payout, token } = info.getValue();
        return (
          <div className='flex items-center gap-1.5'>
            <ArrowUpRightIcon className='h-3.5 w-3.5 text-destructive' />
            <span>{formatToken(payout, token.decimals, token.symbol, 5)}</span>
          </div>
        );
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      fundsCollected: row.fundsCollected,
      token: row.token,
    }),
    {
      id: "fundsCollected",
      header: () => (
        <div className='flex items-center gap-1.5'>
          Earned
          <Tooltip>
            <TooltipTrigger asChild>
              <button type='button' className='inline-flex'>
                <InfoIcon className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs'>
              Total amount earned from providing services
            </TooltipContent>
          </Tooltip>
        </div>
      ),
      cell: (info) => {
        const { fundsCollected, token } = info.getValue();
        return (
          <div className='flex items-center gap-1.5'>
            <ArrowDownLeftIcon className='h-3.5 w-3.5 text-green-600 dark:text-green-500' />
            <span>{formatToken(fundsCollected, token.decimals, token.symbol, 5)}</span>
          </div>
        );
      },
    },
  ),
  columnHelper.accessor("lockupLastSettledUntilTimestamp", {
    header: "Last Settled",
    cell: (info) => formatDate(info.getValue()),
  }),
];
