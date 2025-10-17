import type { Account } from "@filecoin-pay/types";
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
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { formatDate, formatToken } from "@/utils/formatter";

interface AccountTokensProps {
  account: Account;
}

export const AccountTokens: React.FC<AccountTokensProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAccountTokens(account.id, page);

  const totalPages = account.totalTokens ? Math.ceil(Number(account.totalTokens) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Deposited Tokens</h2>
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
        <h2 className='text-2xl font-semibold'>Deposited Tokens</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load tokens</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.userTokens.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Deposited Tokens</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No tokens found</EmptyTitle>
                <EmptyDescription>This account has not deposited any tokens yet.</EmptyDescription>
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
        <h2 className='text-2xl font-semibold'>Deposited Tokens</h2>
        <span className='text-sm text-muted-foreground'>{account.totalTokens.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead className='text-right'>Available Funds</TableHead>
              <TableHead className='text-right'>Lockup Current</TableHead>
              <TableHead className='text-right'>Lockup Rate</TableHead>
              <TableHead className='text-right'>Last Settled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.userTokens.map((userToken) => (
              <TableRow key={userToken.id}>
                <TableCell className='font-medium'>{userToken.token.symbol}</TableCell>
                <TableCell className='text-right'>
                  {formatToken(userToken.funds, userToken.token.decimals, userToken.token.symbol, 5)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(userToken.lockupCurrent, userToken.token.decimals, userToken.token.symbol, 5)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(userToken.lockupRate, userToken.token.decimals, `${userToken.token.symbol}/epoch`, 8)}
                </TableCell>
                <TableCell className='text-right text-muted-foreground'>
                  {formatDate(userToken.lockupLastSettledUntilTimestamp)}
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
