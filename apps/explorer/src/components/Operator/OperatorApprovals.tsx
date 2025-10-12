import type { Operator } from "@filecoin-pay/types";
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
import { Link } from "react-router-dom";
import { AllowanceDisplay } from "@/components/shared";
import { useOperatorApprovals } from "@/hooks/useOperatorDetails";
import { formatAddress, formatToken } from "@/utils/formatter";

interface OperatorApprovalsProps {
  operator: Operator;
}

export const OperatorApprovals: React.FC<OperatorApprovalsProps> = ({ operator }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useOperatorApprovals(operator.id, page);

  const totalPages = operator.totalApprovals ? Math.ceil(Number(operator.totalApprovals) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Operator Approvals</h2>
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
        <h2 className='text-2xl font-semibold'>Operator Approvals</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load approvals</EmptyTitle>
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
        <h2 className='text-2xl font-semibold'>Operator Approvals</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No approvals found</EmptyTitle>
                <EmptyDescription>This operator has no user approvals yet.</EmptyDescription>
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
        <h2 className='text-2xl font-semibold'>Operator Approvals</h2>
        <span className='text-sm text-muted-foreground'>{operator.totalApprovals.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
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
                  <Link to={`/account/${approval.client.address}`} className='text-primary hover:underline'>
                    {formatAddress(approval.client.address)}
                  </Link>
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
                    precision={5}
                  />
                </TableCell>
                <TableCell className='text-right'>
                  <AllowanceDisplay
                    value={approval.rateAllowance}
                    tokenDecimals={approval.token.decimals}
                    symbol={approval.token.symbol}
                    formatValue={formatToken}
                    precision={5}
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
