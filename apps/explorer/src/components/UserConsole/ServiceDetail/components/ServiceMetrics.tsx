import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AlertCircle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { useAccountServiceMetrics, useAccountServiceOneTimePayments } from "@/hooks/useAccountServices";
import { useCurrentTimestamp } from "@/hooks/useCurrentTimestamp";
import type { Network } from "@/types";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import { buildServiceMetricsRows, type ServiceMetricsRow } from "../utils/buildServiceMetricsRows";

const columnHelper = createColumnHelper<ServiceMetricsRow>();

const HeaderWithHint = ({ label, hint }: { label: string; hint: string }) => (
  <div className='flex items-center gap-1.5'>
    {label}
    <Tooltip delayDuration={300}>
      <TooltipTrigger className='inline-flex items-center cursor-help' aria-label={`Explain ${label.toLowerCase()}`}>
        <Info className='h-3.5 w-3.5 text-muted-foreground' />
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        {hint}
      </TooltipContent>
    </Tooltip>
  </div>
);

const columns = [
  columnHelper.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => row.original.token.symbol,
  }),
  columnHelper.display({
    id: "recurring",
    header: () => (
      <HeaderWithHint
        label='Recurring / month'
        hint="What this service's active rails charge over 30 days at their current rates. Rails in their notice period are not included."
      />
    ),
    cell: ({ row }) => {
      const { recurringPerMonth, token } = row.original;
      return <span className='tabular-nums'>{formatTokenAmount(recurringPerMonth, token.decimals)}</span>;
    },
  }),
  columnHelper.display({
    id: "oneTime",
    header: () => (
      <HeaderWithHint
        label='One-time, this month'
        hint='One-off charges from this service since the start of this month in your local time, including fees.'
      />
    ),
    cell: ({ row }) => {
      const { oneTimeThisMonth, token } = row.original;
      if (oneTimeThisMonth === "loading") return "Loading...";
      if (oneTimeThisMonth === "unavailable") return "Unavailable";
      return <span className='tabular-nums'>{formatTokenAmount(oneTimeThisMonth, token.decimals)}</span>;
    },
  }),
  columnHelper.display({
    id: "locked",
    header: () => (
      <HeaderWithHint
        label='Locked deposit'
        hint="The part of your deposit reserved for this service, which you can't withdraw. A terminated rail's deposit stays here until the rail finalizes."
      />
    ),
    cell: ({ row }) => {
      const { lockedDeposit, noticeCopy, token } = row.original;

      return (
        <div className='flex flex-col'>
          <span className='tabular-nums'>{formatTokenAmount(lockedDeposit, token.decimals)}</span>
          {noticeCopy ? (
            // Table cells don't wrap, and this line alone pushed the table past a 1200px window.
            <span className='text-xs text-muted-foreground whitespace-normal'>{noticeCopy}</span>
          ) : null}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "runway",
    header: "Account runway",
    cell: ({ row }) => {
      const { date, detail } = row.original.accountRunway;
      if (!date) return detail;

      return (
        <div className='flex flex-col'>
          <span>{date}</span>
          <span className='text-xs text-muted-foreground'>{detail}</span>
        </div>
      );
    },
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
  const currentTimestamp = useCurrentTimestamp();

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

  const rows = useMemo(() => {
    if (!data) return [];
    const unreadPayments = allPayments.isError ? "unavailable" : "loading";
    const allOneTimePayments = paymentsOverflowPage ? (allPayments.data?.items ?? unreadPayments) : undefined;

    return buildServiceMetricsRows({ ...data, allOneTimePayments }, currentTimestamp);
  }, [data, paymentsOverflowPage, allPayments.data, allPayments.isError, currentTimestamp]);

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
