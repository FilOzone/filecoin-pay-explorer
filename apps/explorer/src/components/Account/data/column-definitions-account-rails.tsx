import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { Account, Rail } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText, NetworkLink, StyledLink } from "@/components/shared";
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { formatDate, formatToken } from "@/utils/formatter";
import { RoleIndicator } from "../components/RoleIndicator";

const columnHelper = createColumnHelper<Rail & { account: Account }>();

export const columns = [
  columnHelper.accessor("railId", {
    header: "Rail ID",
    cell: (info) => (
      <StyledLink>
        <NetworkLink href={`/rails/${info.getValue()}`}>
          <ID number={Number(info.getValue())} />
        </NetworkLink>
      </StyledLink>
    ),
  }),
  columnHelper.accessor(
    (row) => ({
      payer: row.payer,
      account: row.account,
    }),
    {
      header: "Role",
      cell: (info) => {
        const { payer, account } = info.getValue();
        const isPayer = payer.address.toLowerCase() === account.address.toLowerCase();
        return <RoleIndicator role={isPayer ? "payer" : "payee"} />;
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      payer: row.payer,
      payee: row.payee,
      account: row.account,
    }),
    {
      header: "Counterparty",
      cell: (info) => {
        const { payer, payee, account } = info.getValue();
        const isPayer = payer.address.toLowerCase() === account.address.toLowerCase();
        const counterparty = isPayer ? payee : payer;
        return (
          <CopyableText
            value={counterparty.address}
            to={`/accounts/${counterparty.address}`}
            monospace={true}
            label='Account address'
            truncate={true}
            truncateLength={8}
          />
        );
      },
    },
  ),
  columnHelper.accessor("operator", {
    header: "Operator",
    cell: (info) => (
      <CopyableText
        value={info.getValue().address}
        // to={`/operator/${rail.operator.address}`}
        monospace={true}
        label='Service address'
        truncate={true}
        truncateLength={8}
      />
    ),
  }),
  columnHelper.accessor("state", {
    header: "Status",
    cell: (info) => {
      const state = info.getValue();
      return <Badge variant={getRailStateVariant(state)}>{getRailStateLabel(state)}</Badge>;
    },
  }),
  columnHelper.accessor(
    (row) => ({
      paymentRate: row.paymentRate,
      token: row.token,
    }),
    {
      header: "Payment Rate",
      cell: (info) => {
        const { paymentRate, token } = info.getValue();
        return formatToken(paymentRate, token.decimals, `${token.symbol}/epoch`, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      totalSettledAmount: row.totalSettledAmount,
      token: row.token,
    }),
    {
      header: "Settled Amount",
      cell: (info) => {
        const { totalSettledAmount, token } = info.getValue();
        return formatToken(totalSettledAmount, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor("createdAt", {
    header: "Created At",
    cell: (info) => formatDate(info.getValue()),
  }),
];
