import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import USDFCLogo from "@/assests/USDFCLogo";
import { formatCompactNumber, formatFutureTimestamp, formatToken } from "@/utils/formatter";
import { calculateFundingRunway, type FundingStatus } from "./funding-runway";

export type FundsTableRow = UserToken & {
  onAddFunds: (token: UserToken) => void;
  onWithdraw: (token: UserToken) => void;
};

// Short category pill shown next to the "Funded until" date.
const statusPill: Record<FundingStatus, { label: string; className: string; dot: string }> = {
  "long-term-funded": {
    label: "1 yr+",
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
    dot: "bg-green-500",
  },
  funded: { label: "Funded", className: "bg-green-500/10 text-green-700 dark:text-green-400", dot: "bg-green-500" },
  low: { label: "Low", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  urgent: { label: "Urgent", className: "bg-orange-500/10 text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  critical: { label: "Critical", className: "bg-red-500/10 text-red-700 dark:text-red-400", dot: "bg-red-500" },
  "no-active-spend": { label: "Idle", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

function StatusPill({ status }: { status: FundingStatus }) {
  const pill = statusPill[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
      {pill.label}
    </span>
  );
}

const getFundingRunway = (userToken: FundsTableRow) =>
  calculateFundingRunway(userToken, BigInt(Math.floor(Date.now() / 1_000)));

const columnHelper = createColumnHelper<FundsTableRow>();

export const columns = [
  columnHelper.accessor("token.symbol", {
    header: "Token",
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='flex items-center gap-2.5'>
          {userToken.token.symbol === "USDFC" ? (
            <USDFCLogo className='w-6 h-6' />
          ) : (
            <div className='h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center'>
              <span className='text-sm font-semibold text-amber-700 dark:text-amber-400'>
                {userToken.token.symbol.charAt(0)}
              </span>
            </div>
          )}
          <span className='font-medium'>{userToken.token.symbol}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor("funds", {
    header: () => <div className='text-right'>Available</div>,
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='text-right font-medium tabular-nums'>
          {formatToken(getFundingRunway(userToken).availableFunds.toString(), userToken.token.decimals, "", 6)}
        </div>
      );
    },
  }),
  columnHelper.accessor("lockupCurrent", {
    header: () => <div className='text-right'>Locked</div>,
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='text-right font-medium tabular-nums'>
          {formatToken(userToken.lockupCurrent, userToken.token.decimals, "", 6)}
        </div>
      );
    },
  }),
  columnHelper.accessor("payout", {
    header: () => (
      <div className='flex items-center justify-end gap-1.5'>
        Paid out
        <Tooltip delayDuration={300}>
          <TooltipTrigger className='inline-flex items-center cursor-help'>
            <Info className='h-3.5 w-3.5 text-muted-foreground' />
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            Total paid to service providers
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='flex items-center justify-end gap-1.5'>
          <ArrowUpRightIcon className='text-red-500' />
          <span className='font-medium tabular-nums'>
            {formatToken(userToken.payout, userToken.token.decimals, "", 0)}
          </span>
        </div>
      );
    },
  }),
  columnHelper.accessor("fundsCollected", {
    header: () => (
      <div className='flex items-center justify-end gap-1.5'>
        Earned
        <Tooltip delayDuration={300}>
          <TooltipTrigger className='inline-flex items-center cursor-help'>
            <Info className='h-3.5 w-3.5 text-muted-foreground' />
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            Total earned from services
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='flex items-center justify-end gap-1.5'>
          <ArrowDownLeftIcon className='text-brand-500' />
          <span className='font-medium tabular-nums'>
            {formatToken(userToken.fundsCollected, userToken.token.decimals, "", 0)}
          </span>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "fundedUntil",
    header: () => <div className='text-right'>Funded until</div>,
    cell: (info) => {
      const runway = getFundingRunway(info.row.original);
      const runwayEnd = runway.fundedThroughTimestamp;
      const epoch = runway.fundedThroughEpoch;
      const primary =
        runwayEnd !== null
          ? formatFutureTimestamp(Number(runwayEnd))
          : runway.status === "critical"
            ? "Underfunded"
            : "—";

      return (
        <div className='flex flex-col items-end gap-1'>
          <StatusPill status={runway.status} />
          <span className='font-medium'>{primary}</span>
          {epoch !== null && (
            <div className='text-xs text-muted-foreground'>
              Epoch: {epoch > 1_000_000n ? formatCompactNumber(epoch) : epoch.toLocaleString()}
            </div>
          )}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='flex items-center gap-2 py-4'>
          <Button variant='primary' onClick={() => userToken.onAddFunds(userToken)}>
            Add funds
          </Button>
          <Button variant='ghost' onClick={() => userToken.onWithdraw(userToken)}>
            Withdraw
          </Button>
        </div>
      );
    },
  }),
];
