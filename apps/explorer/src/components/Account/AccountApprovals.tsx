import type { Account } from "@filecoin-pay/types";
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
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { AllowanceDisplay, CopyableText } from "@/components/shared";
import { useAccountApprovals } from "@/hooks/useAccountDetails";
import { formatToken } from "@/utils/formatter";

interface AccountApprovalsProps {
  account: Account;
}

export const AccountApprovals: React.FC<AccountApprovalsProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAccountApprovals(account.id, page);

  const totalPages = account.totalApprovals ? Math.ceil(Number(account.totalApprovals) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Authorized Services</h2>
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
        <h2 className='text-2xl font-semibold'>Authorized Services</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load authorized services</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.operatorApprovals.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Authorized Services</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No authorized services found</EmptyTitle>
                <EmptyDescription>This account has not authorized any services yet.</EmptyDescription>
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
        <h2 className='text-2xl font-semibold'>Authorized Services</h2>
        <span className='text-sm text-muted-foreground'>{account.totalApprovals.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Max Lockup Period</TableHead>
              <TableHead className='text-right'>Lockup Allowance</TableHead>
              <TableHead className='text-right'>Rate Allowance</TableHead>
              <TableHead className='text-right'>Lockup Usage</TableHead>
              <TableHead className='text-right'>Rate Usage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.operatorApprovals.map((approval) => (
              <TableRow key={approval.id}>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={approval.operator.address}
                    to={`/operator/${approval.operator.address}`}
                    monospace={true}
                    label='Service address'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell className='font-medium'>{approval.token.symbol}</TableCell>
                <TableCell>
                  <Badge variant={approval.isApproved ? "default" : "destructive"}>
                    {approval.isApproved ? "Approved" : "Revoked"}
                  </Badge>
                </TableCell>
                <TableCell className='text-right'>{approval.maxLockupPeriod.toString()} epochs</TableCell>
                <TableCell className='text-right'>
                  <AllowanceDisplay
                    value={approval.lockupAllowance}
                    tokenDecimals={approval.token.decimals}
                    symbol={approval.token.symbol}
                    formatValue={formatToken}
                    precision={2}
                  />
                </TableCell>
                <TableCell className='text-right'>
                  <AllowanceDisplay
                    value={approval.rateAllowance}
                    tokenDecimals={approval.token.decimals}
                    symbol={approval.token.symbol}
                    formatValue={formatToken}
                    precision={2}
                  />
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(approval.lockupUsage, approval.token.decimals, approval.token.symbol, 5)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(approval.rateUsage, approval.token.decimals, approval.token.symbol, 8)}
                </TableCell>
              </TableRow>
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
