import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { useAccountServiceMetrics } from "@/hooks/useAccountServices";
import type { Network } from "@/types";
import { EPOCH_DURATION } from "@/utils/constants";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import { buildServiceMetricsRows, type ServiceMetricsRow } from "../utils/buildServiceMetricsRows";

const columnHelper = createColumnHelper<ServiceMetricsRow>();

const columns = [
  columnHelper.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => row.original.token.symbol,
  }),
  columnHelper.display({
    id: "recurring",
    header: "Recurring / month",
    cell: ({ row }) => {
      const { recurringPerMonth, token } = row.original;
      return <span className='tabular-nums'>{formatTokenAmount(recurringPerMonth, token.decimals)}</span>;
    },
  }),
  columnHelper.display({
    id: "oneTime",
    header: "One-time, this month",
    cell: ({ row }) => {
      const { oneTimeThisMonth, token } = row.original;
      return <span className='tabular-nums'>{formatTokenAmount(oneTimeThisMonth, token.decimals)}</span>;
    },
  }),
  columnHelper.display({
    id: "locked",
    header: "Locked deposit",
    cell: ({ row }) => {
      const { lockedDeposit, noticeCopy, token } = row.original;

      return (
        <div className='flex flex-col'>
          <span className='tabular-nums'>{formatTokenAmount(lockedDeposit, token.decimals)}</span>
          {noticeCopy ? <span className='text-xs text-muted-foreground'>{noticeCopy}</span> : null}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "runway",
    header: "Account runway",
    cell: ({ row }) => row.original.accountRunway,
  }),
];

const ServiceMetricsTable = ({ data }: { data: ServiceMetricsRow[] }) => {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), enableSorting: false });

  return (
    <ResponsiveTable>
      <TanstackTable table={table} />
    </ResponsiveTable>
  );
};

type ServiceMetricsProps = {
  accountId: string;
  network: Network;
  operatorId: string;
};

const ServiceMetrics = ({ accountId, network, operatorId }: ServiceMetricsProps) => {
  const [currentTimestamp, setCurrentTimestamp] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1_000)));
    }, EPOCH_DURATION * 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // The viewer's local month, as on the spend chart.
  const now = new Date(Number(currentTimestamp) * 1_000);
  const monthStart = BigInt(Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1_000));

  const { data, isLoading, isError } = useAccountServiceMetrics(accountId, operatorId, monthStart, {
    networkOverride: network,
  });

  const rows = useMemo(() => (data ? buildServiceMetricsRows(data, currentTimestamp) : []), [data, currentTimestamp]);

  if (isLoading) {
    return <LoadingStateCard message='Loading spend and funding...' />;
  }

  if (isError) {
    return (
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load spend and funding'
        description='Unable to fetch the totals for this service. Please try again.'
      />
    );
  }

  if (!data || rows.length === 0) return null;

  // ponytail: rails read one page, page them when a pair nears the limit (largest on mainnet: 267 paying rails).
  const mayBeIncomplete = data.rails.length === SUBGRAPH_PAGE_SIZE || data.oneTimePaymentsReachedLimit;

  return (
    <section className='flex flex-col gap-4'>
      <h3 className='text-2xl font-medium'>Spend and funding</h3>
      <ServiceMetricsTable data={rows} />
      {mayBeIncomplete ? (
        <p className='flex items-start gap-2 text-sm text-foreground'>
          <AlertCircle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span>This service reached the data limit, so these totals may be incomplete.</span>
        </p>
      ) : null}
    </section>
  );
};

export default ServiceMetrics;
