import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { Account, Rail } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import {
  CopyableText,
  ExplorerLink,
  NetworkLink,
  RailStateBadge,
  RoleIndicator,
  StyledLink,
} from "@/components/shared";
import { formatDate, formatToken } from "@/utils/formatter";

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
        return (
          <div className='flex justify-center'>
            <RoleIndicator role={isPayer ? "payer" : "payee"} />
          </div>
        );
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
  columnHelper.accessor("operator.address", {
    header: "Operator",
    cell: (info) => <ExplorerLink address={info.getValue()} label='Service address' />,
  }),
  columnHelper.accessor("state", {
    header: "Status",
    cell: (info) => <RailStateBadge state={info.getValue()} />,
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
        return formatToken(paymentRate, token.decimals, token.symbol, 8);
      },
    },
  ),
  columnHelper.accessor(
    (row) => ({
      totalSettledAmount: row.totalSettledAmount,
      totalOneTimePaymentAmount: row.totalOneTimePaymentAmount,
      token: row.token,
    }),
    {
      id: "transactedAmount",
      header: "Transacted Amount",
      cell: (info) => {
        const { totalSettledAmount, totalOneTimePaymentAmount, token } = info.getValue();
        const totalTransactedAmount = BigInt(totalSettledAmount) + BigInt(totalOneTimePaymentAmount);

        return formatToken(totalTransactedAmount, token.decimals, token.symbol, 5);
      },
    },
  ),
  columnHelper.accessor("createdAt", {
    header: "Created At",
    cell: (info) => formatDate(info.getValue()),
  }),
];
