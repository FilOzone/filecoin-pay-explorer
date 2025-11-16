import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { Rail } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText } from "@/components/shared";
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { formatDate, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<Rail>();

export const columns = [
  columnHelper.accessor("railId", {
    header: "Rail ID",
    cell: (info) => <ID number={Number(info.getValue())} />,
  }),
  columnHelper.accessor("payer", {
    header: "Payer",
    cell: (info) => {
      const payer = info.getValue();
      return (
        <CopyableText
          value={payer.address}
          to={`/account/${payer.address}`}
          monospace={true}
          label='Account address'
          truncate={true}
          truncateLength={4}
        />
      );
    },
  }),
  columnHelper.accessor("payee", {
    header: "Payee",
    cell: (info) => {
      const payee = info.getValue();
      return (
        <CopyableText
          value={payee.address}
          to={`/account/${payee.address}`}
          monospace={true}
          label='Account address'
          truncate={true}
          truncateLength={4}
        />
      );
    },
  }),
  columnHelper.accessor("state", {
    header: "State",
    cell: (info) => <Badge variant={getRailStateVariant(info.getValue())}>{getRailStateLabel(info.getValue())}</Badge>,
  }),
  columnHelper.accessor(
    (row) => ({
      paymentRate: row.paymentRate,
      token: row.token,
    }),
    {
      id: "paymentRate",
      header: "Payment Rate",
      cell: (info) => {
        const { paymentRate, token } = info.getValue();
        return formatToken(paymentRate, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      totalSettledAmount: row.totalSettledAmount,
      token: row.token,
    }),
    {
      id: "settledAmount",
      header: "Settled Amount",
      cell: (info) => {
        const { totalSettledAmount, token } = info.getValue();
        return formatToken(totalSettledAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor("createdAt", {
    header: "Date",
    cell: (info) => formatDate(info.getValue()),
  }),
];
