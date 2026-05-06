import type { Settlement } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<Settlement>();

export const columns = [
  columnHelper.accessor("settledUpto", {
    header: "Settled Upto",
    cell: (info) => <div className='font-medium'>Epoch {info.getValue().toString()}</div>,
  }),
  columnHelper.accessor(
    (row) => ({
      totalSettledAmount: row.totalSettledAmount,
      token: row.token,
    }),
    {
      header: "Total Settled",
      cell: (info) => {
        const { totalSettledAmount, token } = info.getValue();
        return formatToken(totalSettledAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      totalNetPayeeAmount: row.totalNetPayeeAmount,
      token: row.token,
    }),
    {
      header: "Net Payee Amount",
      cell: (info) => {
        const { totalNetPayeeAmount, token } = info.getValue();
        return formatToken(totalNetPayeeAmount, token.decimals, token.symbol, 8);
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
