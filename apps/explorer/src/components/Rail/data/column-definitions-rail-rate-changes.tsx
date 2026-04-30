import type { RateChangeQueue } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<RateChangeQueue>();

export const columns = [
  columnHelper.accessor("startEpoch", {
    header: "Start Epoch",
    cell: (info) => <div className='font-medium'>Epoch {info.getValue().toString()}</div>,
  }),
  columnHelper.accessor("untilEpoch", {
    header: "Until Epoch",
    cell: (info) => <div className='font-medium'>Epoch {info.getValue().toString()}</div>,
  }),
  columnHelper.accessor(
    (row) => ({
      rate: row.rate,
      token: row.rail.token,
    }),
    {
      header: "Rate",
      cell: (info) => {
        const { rate, token } = info.getValue();
        return formatToken(rate, token.decimals, token.symbol, 8);
      },
    },
  ),
];
