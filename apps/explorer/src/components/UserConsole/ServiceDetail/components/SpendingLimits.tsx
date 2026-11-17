import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import type { Address, TransactionReceipt } from "viem";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { type ServiceApproval, useServiceApprovals } from "@/hooks/useAccountServices";
import { useGraphQLClient } from "@/hooks/useGraphQLQuery";
import type { Network } from "@/types";
import { fetchSubgraphMeta } from "@/utils/fetchAllPages";
import { invalidateAccountQueries } from "@/utils/query-invalidation";
import { formatLockupLimit, formatPeriodLimit, formatRateLimit } from "../utils/spendingLimits";
import EditLimitsDialog from "./EditLimitsDialog";

const columnHelper = createColumnHelper<ServiceApproval>();

/** Editing is the table's action, not approval data, so the column closes over it. */
const createColumns = (onEdit: (approval: ServiceApproval) => void) => [
  columnHelper.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => row.original.token.symbol,
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className='flex justify-start'>
        <Badge variant={row.original.isApproved ? "primary" : "tertiary"}>
          {row.original.isApproved ? "Active" : "Revoked"}
        </Badge>
      </div>
    ),
  }),
  columnHelper.display({
    id: "rate",
    header: "Rate limit",
    cell: ({ row }) => {
      const { rateAllowance, token } = row.original;
      return formatRateLimit(BigInt(rateAllowance), Number(token.decimals), token.symbol);
    },
  }),
  columnHelper.display({
    id: "lockup",
    header: "Lockup limit",
    cell: ({ row }) => {
      const { lockupAllowance, token } = row.original;
      return formatLockupLimit(BigInt(lockupAllowance), Number(token.decimals), token.symbol);
    },
  }),
  columnHelper.display({
    id: "period",
    header: "Max lockup period",
    cell: ({ row }) => formatPeriodLimit(BigInt(row.original.maxLockupPeriod)),
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => (
      <Button variant='tertiary' size='compact' onClick={() => onEdit(row.original)}>
        {row.original.isApproved ? `Edit ${row.original.token.symbol} limits` : `Approve ${row.original.token.symbol}`}
      </Button>
    ),
  }),
];

const SpendingLimitsLayout = ({ children }: { children: ReactNode }) => (
  <section className='flex flex-col gap-4'>
    <h3 className='text-2xl font-medium'>Spending limits</h3>
    {children}
  </section>
);

type SpendingLimitsProps = {
  network: Network;
  operator: Address;
  userAddress: Address;
};

const SpendingLimits = ({ network, operator, userAddress }: SpendingLimitsProps) => {
  const {
    data: approvals,
    isLoading,
    isError,
  } = useServiceApprovals(userAddress, operator, {
    networkOverride: network,
  });
  const [editing, setEditing] = useState<ServiceApproval["token"] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const queryClient = useQueryClient();
  const { executeQuery } = useGraphQLClient({ networkOverride: network });
  const { data: indexed } = useQuery({
    queryKey: ["service-limits-indexing", network, userAddress, operator, receipt?.transactionHash],
    enabled: receipt !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async ({ signal }) => {
      const { block } = await fetchSubgraphMeta(executeQuery, signal);
      if (!receipt || BigInt(block.number) < receipt.blockNumber) return false;
      await invalidateAccountQueries(queryClient, userAddress, { repeatAfterMs: [] });
      return true;
    },
    refetchInterval: (query) => (query.state.data ? false : 2_000),
  });

  const columns = useMemo(
    () =>
      createColumns((approval) => {
        setEditing(approval.token);
        setDialogOpen(true);
      }),
    [],
  );
  const table = useReactTable({
    data: approvals ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  let content: ReactNode;
  if (isLoading) {
    content = <LoadingStateCard message='Loading spending limits...' />;
  } else if (isError && !approvals) {
    content = (
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load spending limits'
        description='Unable to fetch the limits for this service. Please try again.'
      />
    );
  } else {
    content = approvals?.length ? (
      <ResponsiveTable>
        <TanstackTable table={table} />
      </ResponsiveTable>
    ) : (
      <p className='text-sm text-muted-foreground'>This service has no spending limits yet.</p>
    );
  }

  return (
    <SpendingLimitsLayout>
      {receipt && !indexed ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Your update is confirmed. These limits refresh once it is indexed.
        </p>
      ) : null}
      {content}

      {/* Kept mounted after closing: the dialog tracks its receipt, and the panel leaves with the same token. */}
      {editing ? (
        <EditLimitsDialog
          network={network}
          owner={userAddress}
          operator={operator}
          token={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onConfirmed={(confirmed) =>
            setReceipt((previous) => (previous && previous.blockNumber > confirmed.blockNumber ? previous : confirmed))
          }
        />
      ) : null}
    </SpendingLimitsLayout>
  );
};

export default SpendingLimits;
