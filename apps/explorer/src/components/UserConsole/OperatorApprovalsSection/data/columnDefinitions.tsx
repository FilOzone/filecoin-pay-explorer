import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { OperatorApproval } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Infinity as InfinityIcon } from "lucide-react";
import USDFCLogo from "@/assests/USDFCLogo";
import { CopyableText } from "@/components/shared";
import AllowanceDisplay from "@/components/shared/AllowanceDisplay";
import { formatEpochsAsDuration, formatRatePerMonth, formatToken, isUnlimitedValue } from "@/utils/formatter";

// Create column helper
const columnHelper = createColumnHelper<
  OperatorApproval & {
    onIncrease: (approval: OperatorApproval) => void;
    onDecrease: (approval: OperatorApproval) => void;
  }
>();

export const columns = [
  columnHelper.display({
    id: "operator",
    header: "Service",
    cell: (info) => {
      const approval = info.row.original;
      return (
        <CopyableText
          // to={`/operator/${approval.operator.address}`}
          value={approval.operator.address}
          monospace={true}
          label='Operator address'
          truncate={true}
          truncateLength={10}
        />
      );
    },
  }),
  columnHelper.accessor("token.symbol", {
    header: "Token",
    cell: (info) => {
      const symbol = info.getValue();
      return (
        <div className='flex items-center gap-2.5'>
          {symbol === "USDFC" ? (
            <USDFCLogo className='w-6 h-6' />
          ) : (
            <div className='h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center'>
              <span className='text-sm font-semibold text-amber-700 dark:text-amber-400'>{symbol.charAt(0)}</span>
            </div>
          )}
          <span className='font-medium'>{symbol}</span>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "allowances",
    header: "Allowances",
    cell: (info) => {
      const approval = info.row.original;
      return (
        <div className='text-sm space-y-1'>
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground'>Reserve limit:</span>
            <AllowanceDisplay
              value={approval.lockupAllowance}
              tokenDecimals={approval.token.decimals}
              symbol={approval.token.symbol}
              formatValue={formatToken}
              precision={2}
            />
          </div>
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground'>Spend rate limit:</span>
            <AllowanceDisplay
              value={approval.rateAllowance}
              tokenDecimals={approval.token.decimals}
              symbol={approval.token.symbol}
              formatValue={(value, decimals, symbol) => formatRatePerMonth(value, decimals, symbol)}
              precision={2}
            />
          </div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    cell: (info) => {
      const approval = info.row.original;
      return (
        <div className='flex flex-col gap-1 items-start'>
          <Badge variant={approval.isApproved ? "primary" : "tertiary"}>
            {approval.isApproved ? "Active" : "Revoked"}
          </Badge>
          <div className='text-xs text-muted-foreground'>
            Max lockup:{" "}
            {approval.maxLockupPeriod === BigInt(2) ** BigInt(64) - BigInt(1) ? (
              <span className='inline-flex items-center gap-1'>
                <InfinityIcon className='h-3 w-3' />
              </span>
            ) : (
              formatEpochsAsDuration(approval.maxLockupPeriod)
            )}
          </div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => {
      const approval = info.row.original;
      if (!approval.isApproved) return null;
      // Nothing to increase once both allowances are unlimited; lowering uses
      // the decrease flow (absolute values, not deltas).
      const bothUnlimited = isUnlimitedValue(approval.lockupAllowance) && isUnlimitedValue(approval.rateAllowance);
      const increaseButton = (
        <Button
          variant='primary'
          onClick={() => approval.onIncrease(approval)}
          className='my-3 py-3'
          disabled={bothUnlimited}
        >
          Increase
        </Button>
      );
      return (
        <div className='flex items-center gap-2'>
          {bothUnlimited ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{increaseButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Already unlimited — nothing to increase</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            increaseButton
          )}
          <Button variant='ghost' onClick={() => approval.onDecrease(approval)} className='my-3 py-3'>
            Decrease
          </Button>
        </div>
      );
    },
  }),
];
