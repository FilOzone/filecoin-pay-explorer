import type { UserToken } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText } from "@/components/shared";
import { formatCompactNumber, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<UserToken>();

export const columns = [
  columnHelper.display({
    id: "rank",
    header: "#",
    cell: (info) => <span className='font-semibold text-muted-foreground'>{info.row.index + 1}</span>,
    size: 48,
  }),
  columnHelper.accessor("account.address", {
    header: "Address",
    cell: (info) => (
      <CopyableText
        value={info.getValue()}
        // to={`/account/${info.getValue()}`}
        monospace={true}
        label='Account address'
        truncate={true}
        truncateLength={8}
      />
    ),
  }),
  columnHelper.accessor(
    (row) => ({
      payout: row.payout,
      token: row.token,
    }),
    {
      header: "USDFC spent",
      cell: (info) => {
        const { payout, token } = info.getValue();
        return formatToken(payout, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor("account.totalRails", {
    header: "Total Rails",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
];
