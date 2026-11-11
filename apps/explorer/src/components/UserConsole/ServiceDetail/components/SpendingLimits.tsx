import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import type { Address } from "viem";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { type ServiceApproval, useServiceApprovals } from "@/hooks/useAccountServices";
import type { Network } from "@/types";
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
    cell: ({ row }) =>
      row.original.isApproved ? <Badge variant='primary'>Active</Badge> : <Badge variant='tertiary'>Revoked</Badge>,
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
  accountId: string;
  network: Network;
  operator: Address;
  userAddress: Address;
};

const SpendingLimits = ({ accountId, network, operator, userAddress }: SpendingLimitsProps) => {
  const {
    data: approvals,
    isLoading,
    isError,
  } = useServiceApprovals(accountId, operator, {
    networkOverride: network,
  });
  const [editing, setEditing] = useState<ServiceApproval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns = useMemo(
    () =>
      createColumns((approval) => {
        setEditing(approval);
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

  if (isLoading) {
    return (
      <SpendingLimitsLayout>
        <LoadingStateCard message='Loading spending limits...' />
      </SpendingLimitsLayout>
    );
  }

  if (isError) {
    return (
      <SpendingLimitsLayout>
        <ErrorStateCard
          titleTag='h2'
          title='Failed to load spending limits'
          description='Unable to fetch the limits for this service. Please try again.'
        />
      </SpendingLimitsLayout>
    );
  }

  return (
    <SpendingLimitsLayout>
      {approvals?.length ? (
        <ResponsiveTable>
          <TanstackTable table={table} />
        </ResponsiveTable>
      ) : (
        <p className='text-sm text-muted-foreground'>This service has no spending limits yet.</p>
      )}

      {/* Kept mounted after closing so the panel can finish its leave transition with the same token. */}
      {editing ? (
        <EditLimitsDialog
          network={network}
          owner={userAddress}
          operator={operator}
          token={editing.token}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </SpendingLimitsLayout>
  );
};

export default SpendingLimits;
