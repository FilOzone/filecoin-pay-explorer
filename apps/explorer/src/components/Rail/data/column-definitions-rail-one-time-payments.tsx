import type { OneTimePayment } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<OneTimePayment>();

export const columns = [
  columnHelper.accessor("blockNumber", {
    header: "Block Number",
    cell: (info) => <div className='font-medium'>Epoch {info.getValue().toString()}</div>,
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
