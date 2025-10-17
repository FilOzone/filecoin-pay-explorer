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
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { useOperatorRails } from "@/hooks/useOperatorDetails";
import { formatDate, formatToken } from "@/utils/formatter";
import { CopyableText, StyledLink } from "../shared";

interface OperatorRailsProps {
  operator: Operator;
}

export const OperatorRails: React.FC<OperatorRailsProps> = ({ operator }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useOperatorRails(operator.id, page);

  const totalPages = operator.totalRails ? Math.ceil(Number(operator.totalRails) / 10) : 1;

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
                <EmptyDescription>This operator has not operated any rails yet.</EmptyDescription>
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
        <span className='text-sm text-muted-foreground'>{operator.totalRails.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rail ID</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Payment Rate</TableHead>
              <TableHead className='text-right'>Settled Amount</TableHead>
              <TableHead className='text-right'>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rails.map((rail) => (
              <TableRow key={rail.id}>
                <TableCell className='font-medium'>
                  <StyledLink to={`/rail/${rail.railId}`}>{rail.railId.toString()}</StyledLink>
                </TableCell>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={rail.payer.address}
                    to={`/account/${rail.payer.address}`}
                    monospace={true}
                    label='Account address'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={rail.payee.address}
                    to={`/account/${rail.payee.address}`}
                    monospace={true}
                    label='Account address'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={getRailStateVariant(rail.state)}>{getRailStateLabel(rail.state)}</Badge>
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 5)}
                </TableCell>
                <TableCell className='text-right text-muted-foreground'>{formatDate(rail.createdAt)}</TableCell>
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
