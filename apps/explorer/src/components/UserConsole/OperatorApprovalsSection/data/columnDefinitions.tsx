import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { OperatorApproval } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import USDFCLogo from "@/assests/USDFCLogo";
import { CopyableText } from "@/components/shared";
import AllowanceDisplay from "@/components/shared/AllowanceDisplay";
import { formatToken } from "@/utils/formatter";
import { formatLockupPeriod } from "@/utils/lockup-period";

// Create column helper
const columnHelper = createColumnHelper<OperatorApproval & { onIncrease: (approval: OperatorApproval) => void }>();

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
          label='Service address'
          truncate={true}
          truncateLength={10}
        />
      );
    },
  }),
  columnHelper.accessor("token.symbol", {
    header: "Payment token",
    cell: (info) => {
      const symbol = info.getValue();
      return (
        <div className='flex items-center gap-2.5'>
          {symbol === "USDFC" ? (
            <USDFCLogo className='w-6 h-6' />
          ) : (
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-muted'>
              <span className='text-sm font-semibold text-muted-foreground'>{symbol.charAt(0)}</span>
            </div>
          )}
          <span className='font-medium'>{symbol}</span>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "allowances",
    header: "Spending limits",
    cell: (info) => {
      const approval = info.row.original;
      return (
        <div className='text-sm space-y-1'>
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground'>L:</span>
            <AllowanceDisplay
              value={approval.lockupAllowance}
              tokenDecimals={approval.token.decimals}
              symbol=''
              formatValue={formatToken}
              precision={2}
            />
          </div>
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground'>R:</span>
            <AllowanceDisplay
              value={approval.rateAllowance}
              tokenDecimals={approval.token.decimals}
              symbol=''
              formatValue={formatToken}
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
            Max lockup: {formatLockupPeriod(approval.maxLockupPeriod)}
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
      return approval.isApproved ? (
        <Button variant='primary' onClick={() => approval.onIncrease(approval)} className='my-3 py-3'>
          Increase
        </Button>
      ) : null;
    },
  }),
];
