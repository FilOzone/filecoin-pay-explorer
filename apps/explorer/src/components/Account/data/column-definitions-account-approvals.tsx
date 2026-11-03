import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import type { OperatorApproval } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { createColumnHelper } from "@tanstack/react-table";
import { AllowanceDisplay, ExplorerLink } from "@/components/shared";
import { EPOCH_DURATION } from "@/utils/constants";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<OperatorApproval>();

export const columns = [
  columnHelper.accessor("operator.address", {
    header: "Operator",
    cell: (info) => <ExplorerLink address={info.getValue()} label='Service address' />,
  }),
  columnHelper.accessor("token", {
    header: "Token",
    cell: (info) => info.getValue().symbol,
  }),
  columnHelper.accessor("isApproved", {
    header: "Status",
    cell: (info) => {
      const isApproved = info.getValue();
      return (
        <div className='flex justify-start'>
          <Badge variant={isApproved ? "primary" : "tertiary"}>{isApproved ? "Approved" : "Revoked"}</Badge>
        </div>
      );
    },
  }),
  columnHelper.accessor("maxLockupPeriod", {
    header: "Max Lockup Period",
    cell: (info) => `${Math.ceil((Number(info.getValue()) * EPOCH_DURATION) / 60 / 60 / 24)} days`,
  }),
  columnHelper.accessor(
    (row) => ({
      lockupAllowance: row.lockupAllowance,
      token: row.token,
    }),
    {
      header: "Lockup Allowance",
      cell: (info) => {
        const { lockupAllowance, token } = info.getValue();
        return (
          <AllowanceDisplay
            value={lockupAllowance}
            tokenDecimals={token.decimals}
            symbol={token.symbol}
            formatValue={formatToken}
            precision={2}
          />
        );
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      rateAllowance: row.rateAllowance,
      token: row.token,
    }),
    {
      header: "Rate Allowance/day",
      cell: (info) => {
        const { rateAllowance, token } = info.getValue();
        return (
          <AllowanceDisplay
            value={BigInt(rateAllowance) * TIME_CONSTANTS.EPOCHS_PER_DAY}
            tokenDecimals={token.decimals}
            symbol={token.symbol}
            formatValue={formatToken}
            precision={2}
          />
        );
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      lockupUsage: row.lockupUsage,
      token: row.token,
    }),
    {
      header: "Lockup Usage",
      cell: (info) => {
        const { lockupUsage, token } = info.getValue();
        return formatToken(lockupUsage, token.decimals, token.symbol, 5);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      rateUsage: row.rateUsage,
      token: row.token,
    }),
    {
      header: "Rate Usage/day",
      cell: (info) => {
        const { rateUsage, token } = info.getValue();
        const rateUsagePerDay = BigInt(rateUsage) * TIME_CONSTANTS.EPOCHS_PER_DAY;
        return formatToken(rateUsagePerDay, token.decimals, token.symbol, 8);
      },
    },
  ),
];
