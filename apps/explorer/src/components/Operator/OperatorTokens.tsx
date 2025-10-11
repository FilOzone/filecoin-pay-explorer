import type { Operator } from "@filecoin-pay/types";
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
import { useOperatorTokens } from "@/hooks/useOperatorDetails";
import { formatToken } from "@/utils/formatter";

interface OperatorTokensProps {
  operator: Operator;
}

export const OperatorTokens: React.FC<OperatorTokensProps> = ({ operator }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useOperatorTokens(operator.id, page);

  const totalPages = operator.totalTokens ? Math.ceil(Number(operator.totalTokens) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Operator Tokens</h2>
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
        <h2 className='text-2xl font-semibold'>Operator Tokens</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load operator tokens</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.operatorTokens.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Operator Tokens</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No tokens found</EmptyTitle>
                <EmptyDescription>This operator has not operated any tokens yet.</EmptyDescription>
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
        <h2 className='text-2xl font-semibold'>Operator Tokens</h2>
        <span className='text-sm text-muted-foreground'>{operator.totalTokens.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead className='text-right'>Commission Earned</TableHead>
              <TableHead className='text-right'>Settled Amount</TableHead>
              <TableHead className='text-right'>Lockup Usage</TableHead>
              <TableHead className='text-right'>Rate Usage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.operatorTokens.map((operatorToken) => (
              <TableRow key={operatorToken.id}>
                <TableCell className='font-medium'>{operatorToken.token.symbol}</TableCell>
                <TableCell className='text-right'>
                  {formatToken(
                    operatorToken.commissionEarned,
                    operatorToken.token.decimals,
                    operatorToken.token.symbol,
                    2,
                  )}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(
                    operatorToken.settledAmount,
                    operatorToken.token.decimals,
                    operatorToken.token.symbol,
                    5,
                  )}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(operatorToken.lockupUsage, operatorToken.token.decimals, operatorToken.token.symbol, 5)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(operatorToken.rateUsage, operatorToken.token.decimals, operatorToken.token.symbol, 8)}
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
