import type { OneTimePayment } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { formatDate, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<OneTimePayment>();

export const columns = [
  columnHelper.accessor("blockNumber", {
    header: "Payment Date",
    cell: (info) => {
      const payment = info.row.original;
      return (
        <div className='flex flex-col gap-0.5'>
          <div className='font-medium'>{formatDate(payment.createdAt)}</div>
          <div className='text-xs text-muted-foreground'>Block {info.getValue().toString()}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor(
    (row) => ({
      totalAmount: row.totalAmount,
      token: row.token,
    }),
    {
      header: "Total Amount",
      cell: (info) => {
        const { totalAmount, token } = info.getValue();
        return formatToken(totalAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      netPayeeAmount: row.netPayeeAmount,
      token: row.token,
    }),
    {
      header: "Net Payee Amount",
      cell: (info) => {
        const { netPayeeAmount, token } = info.getValue();
        return formatToken(netPayeeAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      networkFee: row.networkFee,
      token: row.token,
    }),
    {
      header: "Network Fees",
      cell: (info) => {
        const { networkFee, token } = info.getValue();
        return formatToken(networkFee, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      operatorCommission: row.operatorCommission,
      token: row.token,
    }),
    {
      header: "Operator Commission",
      cell: (info) => {
        const { operatorCommission, token } = info.getValue();
        return formatToken(operatorCommission, token.decimals, token.symbol, 8);
      },
    },
  ),
];
