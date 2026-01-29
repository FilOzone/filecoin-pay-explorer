import { Badge as FilecoinBadge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { Rail } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { CopyableText, RailStateBadge } from "@/components/shared";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { formatAddress, formatDate, formatToken } from "@/utils/formatter";

// Create column helper
const columnHelper = createColumnHelper<Rail & { userAddress: string }>();

export const createColumns = (onSettle: (rail: Rail) => void) => [
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
      const rail = info.row.original;
      const isPayer = rail.payer.address.toLowerCase() === rail.userAddress.toLowerCase();

      return (
        <div className='flex flex-col gap-1 items-start'>
          <FilecoinBadge variant={isPayer ? "tertiary" : "primary"} icon={isPayer ? ArrowUpRight : ArrowDownLeft}>
            {isPayer ? "Payer" : "Payee"}
          </FilecoinBadge>
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
      const rail = info.row.original;
      const isPayer = rail.payer.address.toLowerCase() === rail.userAddress.toLowerCase();
      const counterparty = isPayer ? rail.payee : rail.payer;

      return (
        <div className='flex flex-col gap-1'>
          <CopyableText
            className='text-sm font-medium'
            value={counterparty.address}
            to={`/account/${counterparty.address}`}
            monospace={true}
            label='Account address'
            truncate={true}
            truncateLength={8}
          />
          <div className='text-xs text-muted-foreground'>Operator: {formatAddress(rail.operator.address)}</div>
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
          <RailStateBadge state={rail.state} />
          <div className='text-xs text-muted-foreground'>Lockup: {rail.lockupPeriod.toString()} epochs</div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: (info) => {
      const rail = info.row.original;
      return (
        <div className='flex justify-center'>
          <Button baseDomain={BASE_DOMAIN} variant='primary' className='py-2 my-4' onClick={() => onSettle(rail)}>
            Settle
          </Button>
        </div>
      );
    },
  }),
];
