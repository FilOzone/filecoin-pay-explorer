import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { AlertCircle, Info } from "lucide-react";
import { maxUint256 } from "viem";
import USDFCLogo from "@/assests/USDFCLogo";
import { EPOCH_DURATION, FUNDING_WARNING_THRESHOLD_SECONDS } from "@/utils/constants";
import { formatFutureTimestamp, formatTimestampToTime, formatToken } from "@/utils/formatter";

export type FundsTableRow = UserToken & {
  currentTimestamp: bigint;
  onAddFunds: (token: UserToken) => void;
  onWithdraw: (token: UserToken) => void;
};

type FundingStatus = "infinity" | "expired" | "warning" | "funded";

type FundedUntilPresentation = {
  detail: string | null;
  showWarningIcon: boolean;
  timeColor: string;
};

// Helper function to calculate funded until data
const calculateFundedUntil = (userToken: FundsTableRow) => {
  const funds = BigInt(userToken.funds);
  const lockupCurrent = BigInt(userToken.lockupCurrent);
  const lastSettledAt = BigInt(userToken.lockupLastSettledUntilEpoch);
  const lastSettledTimestamp = BigInt(userToken.lockupLastSettledUntilTimestamp);
  const lockupRate = BigInt(userToken.lockupRate);

  let elapsedEpochs = 0n;
  if (userToken.currentTimestamp > lastSettledTimestamp) {
    elapsedEpochs = (userToken.currentTimestamp - lastSettledTimestamp) / BigInt(EPOCH_DURATION);
  }

  const currentEpoch = lastSettledAt + elapsedEpochs;

  const fundedUntilEpoch = lockupRate === 0n ? maxUint256 : lastSettledAt + (funds - lockupCurrent) / lockupRate;
  const simulatedSettledAt = fundedUntilEpoch < currentEpoch ? fundedUntilEpoch : currentEpoch;
  const simulatedLockupCurrent = lockupCurrent + lockupRate * (simulatedSettledAt - lastSettledAt);

  const rawAvailable = funds - simulatedLockupCurrent;
  const availableFunds = rawAvailable > 0n ? rawAvailable : 0n;

  const fundedUntilTimestamp =
    lockupRate === 0n ? maxUint256 : lastSettledTimestamp + (fundedUntilEpoch - lastSettledAt) * BigInt(EPOCH_DURATION);

  const totalOwed = lockupCurrent + lockupRate * elapsedEpochs;
  let debt = 0n;
  if (totalOwed > funds) {
    debt = totalOwed - funds;
  }

  return {
    availableFunds,
    debt,
    fundedUntilTimestamp,
    simulatedLockupCurrent,
  };
};

/** Checks whether the account is funded, running low, expired, or has no ongoing spending. */
const getFundingStatus = (fundedUntilTimestamp: bigint, currentTimestamp: bigint) => {
  if (fundedUntilTimestamp === maxUint256) return "infinity";
  else if (fundedUntilTimestamp <= currentTimestamp) return "expired";
  else if (fundedUntilTimestamp - currentTimestamp <= BigInt(FUNDING_WARNING_THRESHOLD_SECONDS)) return "warning";

  return "funded";
};

/** Formats when the account's funds are expected to run out. */
const formatFundedUntilTimestamp = (fundedUntilTimestamp: bigint, currentTimestamp: bigint) => {
  if (fundedUntilTimestamp === maxUint256) return "Infinity";
  return formatFutureTimestamp(fundedUntilTimestamp, currentTimestamp);
};

function TokenIcon({ token }: { token: UserToken["token"] }) {
  if (token.symbol === "USDFC") {
    return <USDFCLogo className='w-6 h-6' />;
  }

  return (
    <div className='h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center'>
      <span className='text-sm font-semibold text-amber-700 dark:text-amber-400'>{token.symbol.charAt(0)}</span>
    </div>
  );
}

function formatDebtDetail(userToken: FundsTableRow, debt: bigint) {
  return `Debt: ${formatToken(debt, userToken.token.decimals, userToken.token.symbol, 6)}`;
}

function getFundedUntilPresentation(
  fundingStatus: FundingStatus,
  userToken: FundsTableRow,
  fundedUntilTimestamp: bigint,
  debt: bigint,
): FundedUntilPresentation {
  const fundedUntilDetail = formatTimestampToTime(fundedUntilTimestamp);

  switch (fundingStatus) {
    case "infinity":
      return {
        detail: null,
        showWarningIcon: false,
        timeColor: "text-green-600 dark:text-green-400",
      };
    case "expired":
      return {
        detail: formatDebtDetail(userToken, debt),
        showWarningIcon: false,
        timeColor: "text-red-600 dark:text-red-400",
      };
    case "warning":
      return {
        detail: fundedUntilDetail,
        showWarningIcon: true,
        timeColor: "text-amber-600 dark:text-amber-400",
      };
    case "funded":
      return {
        detail: fundedUntilDetail,
        showWarningIcon: false,
        timeColor: "text-foreground",
      };
  }
}

// Create column helper
const columnHelper = createColumnHelper<FundsTableRow>();

export const columns = [
  columnHelper.accessor("token.symbol", {
    header: "Token",
    cell: (info) => {
      const userToken = info.row.original;
      return (
        <div className='flex items-center gap-2.5'>
          <TokenIcon token={userToken.token} />
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
      const { simulatedLockupCurrent } = calculateFundedUntil(userToken);
      return (
        <div className='text-right font-medium tabular-nums'>
          {formatToken(simulatedLockupCurrent, userToken.token.decimals, "", 6)}
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
      const { debt, fundedUntilTimestamp } = calculateFundedUntil(userToken);
      const fundingStatus = getFundingStatus(fundedUntilTimestamp, userToken.currentTimestamp);
      const presentation = getFundedUntilPresentation(fundingStatus, userToken, fundedUntilTimestamp, debt);

      return (
        <div className='text-right'>
          <div className={`font-medium ${presentation.timeColor} flex items-center justify-end gap-1`}>
            {presentation.showWarningIcon && <AlertCircle className='h-3.5 w-3.5' />}
            {formatFundedUntilTimestamp(fundedUntilTimestamp, userToken.currentTimestamp)}
          </div>
          {presentation.detail && <div className='text-xs text-muted-foreground'>{presentation.detail}</div>}
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
