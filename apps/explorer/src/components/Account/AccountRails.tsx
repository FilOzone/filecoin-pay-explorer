import type { Account, Rail, RailState } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { formatDate, formatToken } from "@/utils/formatter";
import { CopyableText } from "../shared";

interface AccountRailsProps {
  account: Account;
}

const getStatusVariant = (state: RailState): "default" | "secondary" | "destructive" | "outline" => {
  switch (state) {
    case "ACTIVE":
      return "default";
    case "ZERORATE":
      return "secondary";
    case "TERMINATED":
      return "destructive";
    case "FINALIZED":
      return "outline";
    default:
      return "secondary";
  }
};

interface RoleIndicatorProps {
  role: "payer" | "payee";
}

const RoleIndicator: React.FC<RoleIndicatorProps> = ({ role }) => {
  if (role === "payer") {
    return (
      <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 text-destructive'>
        <ArrowUpRight className='h-3.5 w-3.5' />
        <span className='text-xs font-medium'>Payer</span>
      </div>
    );
  }
  return (
    <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400'>
      <ArrowDownLeft className='h-3.5 w-3.5' />
      <span className='text-xs font-medium'>Payee</span>
    </div>
  );
};

interface RailRowProps {
  rail: Rail;
  accountAddress: string;
}

const RailRow: React.FC<RailRowProps> = ({ rail, accountAddress }) => {
  const isPayer = rail.payer.address.toLowerCase() === accountAddress.toLowerCase();
  const counterparty = isPayer ? rail.payee : rail.payer;

  return (
    <TableRow>
      <TableCell className='font-medium'>
        <Link to={`/rail/${rail.railId}`} className='text-primary hover:underline'>
          {rail.railId.toString()}
        </Link>
      </TableCell>
      <TableCell>
        <RoleIndicator role={isPayer ? "payer" : "payee"} />
      </TableCell>
      <TableCell className='font-mono text-sm'>
        <CopyableText
          value={counterparty.address}
          to={`/account/${counterparty.address}`}
          monospace={true}
          label='Account'
          truncate={true}
          truncateLength={8}
        />
      </TableCell>
      <TableCell className='font-mono text-sm'>
        <CopyableText
          value={rail.operator.address}
          to={`/operator/${rail.operator.address}`}
          monospace={true}
          label='Account'
          truncate={true}
          truncateLength={8}
        />
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(rail.state)}>{rail.state}</Badge>
      </TableCell>
      <TableCell className='text-right'>
        {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 8)}
      </TableCell>
      <TableCell className='text-right'>
        {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
      </TableCell>
      <TableCell className='text-right text-muted-foreground'>{formatDate(rail.createdAt)}</TableCell>
    </TableRow>
  );
};

export const AccountRails: React.FC<AccountRailsProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAccountRails(account.id, page);

  const totalPages = account.totalRails ? Math.ceil(Number(account.totalRails) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Rails</h2>
        </div>
        <Card>
          <div className='p-4 space-y-4'>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Rails</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load rails</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.rails.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Rails</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No rails found</EmptyTitle>
                <EmptyDescription>This account is not part of any payment rails yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-semibold'>Rails</h2>
        <span className='text-sm text-muted-foreground'>{account.totalRails.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rail ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Payment Rate</TableHead>
              <TableHead className='text-right'>Settled Amount</TableHead>
              <TableHead className='text-right'>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rails.map((rail) => (
              <RailRow key={rail.id} rail={rail} accountAddress={account.address} />
            ))}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setPage(pageNum)}
                    isActive={page === pageNum}
                    className='cursor-pointer'
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};
