import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { AlertCircle, Info } from "lucide-react";
import USDFCLogo from "@/assests/USDFCLogo";
import { EPOCH_DURATION, FUNDING_WARNING_THRESHOLD_SECONDS } from "@/utils/constants";
import { formatCompactNumber, formatFutureTimestamp, formatToken } from "@/utils/formatter";

// Helper function to calculate funded until data
const calculateFundedUntil = (userToken: UserToken) => {
  const availableFunds = BigInt(userToken.funds) - BigInt(userToken.lockupCurrent);
  const lockupRate = BigInt(userToken.lockupRate);
  const fundedUntil = availableFunds > 0 && lockupRate > 0 ? availableFunds / lockupRate : 0n;
  const fundedUntilTimestamp = BigInt(userToken.lockupLastSettledUntilTimestamp) + fundedUntil * BigInt(EPOCH_DURATION);
  const fundedUntilEpoch = BigInt(userToken.lockupLastSettledUntilEpoch) + fundedUntil;

  const isInfinity = lockupRate === 0n;
  const fundedUntilTime = isInfinity ? "Infinity" : formatFutureTimestamp(Number(fundedUntilTimestamp));
  const isExpired = !isInfinity && fundedUntilTime === "Expired";

  const timeUntilExpiry = Number(fundedUntilTimestamp) - Date.now() / 1000;
  const isWarning =
    !isInfinity && !isExpired && timeUntilExpiry > 0 && timeUntilExpiry <= FUNDING_WARNING_THRESHOLD_SECONDS;

  return {
    availableFunds,
    fundedUntilTime,
    fundedUntilEpoch,
    isInfinity,
    isExpired,
    isWarning,
  };
};

// Create column helper
const columnHelper = createColumnHelper<
  UserToken & { onDeposit: (token: UserToken) => void; onWithdraw: (token: UserToken) => void }
>();

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
      const { availableFunds } = calculateFundedUntil(userToken);
      return (
        <div className='text-right font-medium tabular-nums'>
          {formatToken(availableFunds.toString(), userToken.token.decimals, "", 6)}
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
      const userToken = info.row.original;
      const { fundedUntilTime, fundedUntilEpoch, isInfinity, isExpired, isWarning } = calculateFundedUntil(userToken);

      const timeColor = isInfinity
        ? "text-green-600 dark:text-green-400"
        : isExpired
          ? "text-red-600 dark:text-red-400"
          : isWarning
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground";

      return (
        <div className='text-right'>
          <div className={`font-medium ${timeColor} flex items-center justify-end gap-1`}>
            {isWarning && <AlertCircle className='h-3.5 w-3.5' />}
            {fundedUntilTime}
          </div>
          {!isInfinity && (
            <div className='text-xs text-muted-foreground'>
              Epoch:{" "}
              {fundedUntilEpoch > 1_000_000n
                ? formatCompactNumber(fundedUntilEpoch)
                : fundedUntilEpoch.toLocaleString()}
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
          <Button variant='primary' onClick={() => userToken.onDeposit(userToken)}>
            Deposit
          </Button>
          <Button variant='ghost' onClick={() => userToken.onWithdraw(userToken)}>
            Withdraw
          </Button>
        </div>
      );
    },
  }),
];
