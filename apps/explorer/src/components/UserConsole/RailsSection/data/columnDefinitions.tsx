import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText, RailStateBadge, RoleIndicator } from "@/components/shared";
import { formatAddress, formatDate, formatToken } from "@/utils/formatter";
import { RailActions } from "../components";
import type { RailTableRow } from "../types";

// Create column helper
const columnHelper = createColumnHelper<RailTableRow>();

export const columns = [
  columnHelper.accessor("railId", {
    id: "railId",
    header: "Rail ID",
    cell: (info) => {
      const railId = info.getValue();
      return (
        // TODO: add styled link when per rail page is ready
        <ID number={Number(railId)} />
      );
    },
  }),
  columnHelper.display({
    id: "type",
    header: "Type",
    cell: (info) => {
      const { isPayer } = info.row.original;

      return (
        <div className='flex justify-center'>
          <RoleIndicator role={isPayer ? "payer" : "payee"} />
        </div>
      );
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Date",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "counterparty",
    header: "Counterparty",
    cell: (info) => {
      const { isPayer, payee, payer, operator } = info.row.original;
      const counterparty = isPayer ? payee : payer;

      return (
        <div className='flex flex-col gap-1'>
          <CopyableText
            className='text-sm font-medium'
            value={counterparty.address}
            to={`/accounts/${counterparty.address}`}
            monospace={true}
            label='Account address'
            truncate={true}
            truncateLength={8}
          />
          <div className='text-xs text-muted-foreground'>Operator: {formatAddress(operator.address)}</div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "payment",
    header: () => <div className='text-right'>Payment Rate</div>,
    cell: (info) => {
      const rail = info.row.original;
      return (
        <div className='flex flex-col gap-1 text-right'>
          <div className='font-medium text-sm tabular-nums'>
            {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
          </div>
          <div className='text-xs text-muted-foreground'>
            Settled: {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
          </div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "state",
    header: "State",
    cell: (info) => {
      const rail = info.row.original;
      return (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <RailStateBadge state={rail.state} />
          </div>
          <div className='text-xs text-muted-foreground'>Lockup: {rail.lockupPeriod.toString()} epochs</div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: (info) => <RailActions rail={info.row.original} />,
  }),
];
