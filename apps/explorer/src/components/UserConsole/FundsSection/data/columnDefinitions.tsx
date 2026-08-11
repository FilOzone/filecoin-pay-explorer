import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { AlertCircle, Info } from "lucide-react";
import USDFCLogo from "@/assests/USDFCLogo";
import { EPOCH_DURATION, FUNDING_WARNING_THRESHOLD_SECONDS } from "@/utils/constants";
import { formatFutureTimestamp, formatTimestampToTime, formatToken } from "@/utils/formatter";

export type FundsTableRow = UserToken & {
  currentEpoch: bigint | undefined;
  onDeposit: (token: UserToken) => void;
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
  // A sub-epoch remainder can stay available while debt represents the additional amount required.
  let availableFunds = 0n;
  if (funds > lockupCurrent) {
    availableFunds = funds - lockupCurrent;
  }

  const lockupRate = BigInt(userToken.lockupRate);
  let fundedUntil = 0n;
  if (availableFunds > 0n && lockupRate > 0n) {
    fundedUntil = availableFunds / lockupRate;
  }

  const fundedUntilTimestamp = BigInt(userToken.lockupLastSettledUntilTimestamp) + fundedUntil * BigInt(EPOCH_DURATION);

  const lastSettledEpoch = BigInt(userToken.lockupLastSettledUntilEpoch);
  let elapsedEpochs = 0n;
  if (userToken.currentEpoch !== undefined && userToken.currentEpoch > lastSettledEpoch) {
    elapsedEpochs = userToken.currentEpoch - lastSettledEpoch;
  }

  const totalOwed = lockupCurrent + lockupRate * elapsedEpochs;
  let debt: bigint | undefined;
  if (userToken.currentEpoch !== undefined) {
    debt = 0n;
    if (totalOwed > funds) {
      debt = totalOwed - funds;
    }
  }

  let fundedUntilTime = "Infinity";
  if (lockupRate > 0n) {
    fundedUntilTime = formatFutureTimestamp(Number(fundedUntilTimestamp));
  }

  const timeUntilExpiry = Number(fundedUntilTimestamp) - Date.now() / 1000;
  let fundingStatus: FundingStatus = "funded";
  if (lockupRate === 0n) {
    fundingStatus = "infinity";
  } else if (fundedUntilTime === "Expired") {
    fundingStatus = "expired";
  } else if (timeUntilExpiry > 0 && timeUntilExpiry <= FUNDING_WARNING_THRESHOLD_SECONDS) {
    fundingStatus = "warning";
  }

  return {
    availableFunds,
    debt,
    fundingStatus,
    fundedUntilTime,
    fundedUntilTimestamp,
  };
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

function formatDebtDetail(userToken: FundsTableRow, debt: bigint | undefined) {
  if (debt === undefined) {
    return "Debt: Loading...";
  }

  return `Debt: ${formatToken(debt, userToken.token.decimals, userToken.token.symbol, 6)}`;
}

function getFundedUntilPresentation(
  fundingStatus: FundingStatus,
  userToken: FundsTableRow,
  fundedUntilTimestamp: bigint,
  debt: bigint | undefined,
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
      const { debt, fundingStatus, fundedUntilTime, fundedUntilTimestamp } = calculateFundedUntil(userToken);
      const presentation = getFundedUntilPresentation(fundingStatus, userToken, fundedUntilTimestamp, debt);

      return (
        <div className='text-right'>
          <div className={`font-medium ${presentation.timeColor} flex items-center justify-end gap-1`}>
            {presentation.showWarningIcon && <AlertCircle className='h-3.5 w-3.5' />}
            {fundedUntilTime}
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
