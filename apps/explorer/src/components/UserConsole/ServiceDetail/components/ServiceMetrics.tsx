import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import {
  useAccountServiceMetrics,
  useAccountServiceOneTimePayments,
  useAccountServiceRailTokens,
} from "@/hooks/useAccountServices";
import type { Network } from "@/types";
import { EPOCH_DURATION } from "@/utils/constants";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import { buildServiceMetricsRows, type ServiceMetricsRow } from "../utils/buildServiceMetricsRows";

const NO_TOKEN_IDS: string[] = [];

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
      if (oneTimeThisMonth === "loading") return "Loading...";
      if (oneTimeThisMonth === "unavailable") return "Unavailable";
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
    cell: ({ row }) => row.original.accountRunwayText,
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

const ServiceMetricsLayout = ({ children }: { children: ReactNode }) => (
  <section className='flex flex-col gap-4'>
    <h3 className='text-2xl font-medium'>Spend and funding</h3>
    {children}
  </section>
);

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

  const paymentsOverflowPage = data?.oneTimePayments.length === SUBGRAPH_PAGE_SIZE;
  const allPayments = useAccountServiceOneTimePayments(accountId, operatorId, monthStart, {
    enabled: paymentsOverflowPage,
    networkOverride: network,
  });

  const approvedTokenIds = useMemo(
    () => data?.account?.operatorApprovals.map(({ token }) => token.id) ?? NO_TOKEN_IDS,
    [data],
  );
  const { data: tokenIdsWithRails } = useAccountServiceRailTokens(accountId, operatorId, approvedTokenIds, {
    networkOverride: network,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const unreadPayments = allPayments.isError ? "unavailable" : "loading";
    const oneTimePayments = paymentsOverflowPage ? (allPayments.data?.items ?? unreadPayments) : data.oneTimePayments;

    return buildServiceMetricsRows({ ...data, oneTimePayments, tokenIdsWithRails }, currentTimestamp);
  }, [data, paymentsOverflowPage, allPayments.data, allPayments.isError, tokenIdsWithRails, currentTimestamp]);

  if (isLoading) {
    return (
      <ServiceMetricsLayout>
        <LoadingStateCard message='Loading spend and funding...' />
      </ServiceMetricsLayout>
    );
  }

  if (isError) {
    return (
      <ServiceMetricsLayout>
        <ErrorStateCard
          titleTag='h2'
          title='Failed to load spend and funding'
          description='Unable to fetch the totals for this service. Please try again.'
        />
      </ServiceMetricsLayout>
    );
  }

  if (!data || rows.length === 0) return null;

  // ponytail: rails read one page, page them when a pair nears the limit (largest on mainnet: 267 paying rails).
  const mayBeIncomplete = data.rails.length === SUBGRAPH_PAGE_SIZE || allPayments.data?.reachedPageLimit;

  return (
    <ServiceMetricsLayout>
      <ServiceMetricsTable data={rows} />
      {mayBeIncomplete ? (
        <p className='flex items-start gap-2 text-sm text-foreground'>
          <AlertCircle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span>This service reached the data limit, so these totals may be incomplete.</span>
        </p>
      ) : null}
    </ServiceMetricsLayout>
  );
};

export default ServiceMetrics;
