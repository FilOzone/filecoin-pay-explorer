import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { Rail } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText, StyledLink } from "@/components/shared";
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { formatDate, formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<Rail>();

export const columns = [
  columnHelper.accessor("railId", {
    header: "Rail ID",
    cell: (info) => (
      <StyledLink to={`/rail/${info.getValue()}`}>
        <ID number={Number(info.getValue())} />
      </StyledLink>
    ),
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
          truncateLength={8}
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
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("operator", {
    header: "Operator",
    cell: (info) => {
      const operator = info.getValue();
      return (
        <CopyableText
          value={operator.address}
          to={`/operator/${operator.address}`}
          monospace={true}
          label='Service address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("state", {
    header: "Status",
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
        return formatToken(totalSettledAmount, token.decimals, token.symbol, 2);
      },
    },
  ),
  columnHelper.accessor("createdAt", {
    header: "Created At",
    cell: (info) => formatDate(info.getValue()),
  }),
];
