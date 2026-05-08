import type { OperatorApproval } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { createColumnHelper } from "@tanstack/react-table";
import { AllowanceDisplay, CopyableText } from "@/components/shared";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<OperatorApproval>();

export const columns = [
  columnHelper.accessor("operator", {
    header: "Operator",
    cell: (info) => (
      <CopyableText
        value={info.getValue().address}
        // to={`/operator/${approval.operator.address}`}
        monospace={true}
        label='Service address'
        truncate={true}
        truncateLength={8}
      />
    ),
  }),
  columnHelper.accessor("token", {
    header: "Token",
    cell: (info) => info.getValue().symbol,
  }),
  columnHelper.accessor("isApproved", {
    header: "Status",
    cell: (info) => {
      const isApproved = info.getValue();
      return <Badge variant={isApproved ? "default" : "destructive"}>{isApproved ? "Approved" : "Revoked"}</Badge>;
    },
  }),
  columnHelper.accessor("maxLockupPeriod", {
    header: "Max Lockup Period",
    cell: (info) => `${info.getValue().toString()} epochs`,
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
      header: "Rate Allowance",
      cell: (info) => {
        const { rateAllowance, token } = info.getValue();
        return (
          <AllowanceDisplay
            value={rateAllowance}
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
      header: "Rate Usage",
      cell: (info) => {
        const { rateUsage, token } = info.getValue();
        return formatToken(rateUsage, token.decimals, token.symbol, 8);
      },
    },
  ),
];
