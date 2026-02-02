import type { Rail } from "@filecoin-pay/types";
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
import { useRailSettlements } from "@/hooks/useRailDetails";
import { formatFIL, formatToken } from "@/utils/formatter";

interface RailSettlementsProps {
  rail: Rail;
}

export const RailSettlements: React.FC<RailSettlementsProps> = ({ rail }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useRailSettlements(rail.id, page);

  const totalPages = rail.totalSettlements ? Math.ceil(Number(rail.totalSettlements) / 10) : 1;

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Settlements</h2>
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
        <h2 className='text-2xl font-semibold'>Settlements</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load settlements</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.settlements.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Settlements</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No settlements found</EmptyTitle>
                <EmptyDescription>This rail has no settlements yet.</EmptyDescription>
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
        <h2 className='text-2xl font-semibold'>Settlements</h2>
        <span className='text-sm text-muted-foreground'>{rail.totalSettlements.toString()} total</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Settled Upto</TableHead>
              <TableHead className='text-right'>Total Settled</TableHead>
              <TableHead className='text-right'>Net Payee Amount</TableHead>
              <TableHead className='text-right'>Network Revenue</TableHead>
              <TableHead className='text-right'>Operator Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.settlements.map((settlement) => (
              <TableRow key={settlement.id}>
                <TableCell className='font-medium'>Epoch {settlement.settledUpto.toString()}</TableCell>
                <TableCell className='text-right'>
                  {formatToken(settlement.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(settlement.totalNetPayeeAmount, rail.token.decimals, rail.token.symbol, 8)}
                </TableCell>
                <TableCell className='text-right'>{formatFIL(settlement.networkFee)}</TableCell>
                <TableCell className='text-right'>
                  {formatToken(settlement.operatorCommission, rail.token.decimals, rail.token.symbol, 8)}
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
