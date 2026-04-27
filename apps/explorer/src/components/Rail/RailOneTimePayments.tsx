"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Rail } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, Info } from "lucide-react";
import { useState } from "react";
import { useRailOneTimePayments } from "@/hooks/useRailDetails";
import { formatFIL, formatToken } from "@/utils/formatter";

interface RailOneTimePaymentsLayoutProps {
  children: React.ReactNode;
}

const RailOneTimePaymentsLayout: React.FC<RailOneTimePaymentsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-20'>
      <h3 className='text-2xl font-medium'>One Time Payments</h3>
      {children}
    </div>
  </PageSection>
);

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load one time payments'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

const NotFoundState: React.FC = () => (
  <EmptyStateCard
    icon={Info}
    title='No one time payments found'
    titleTag='h2'
    description={`This rail has no one time payments yet.`}
  ></EmptyStateCard>
);

interface RailOneTimePaymentsProps {
  rail: Rail;
}

export const RailOneTimePayments: React.FC<RailOneTimePaymentsProps> = ({ rail }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useRailOneTimePayments(rail.id, page);

  const totalOneTimePayments = Number(rail.totalOneTimePayments);
  const totalPages = totalOneTimePayments ? Math.ceil(totalOneTimePayments / 10) : 1;

  return (
    <RailOneTimePaymentsLayout>
      {isLoading && totalOneTimePayments > 0 && <LoadingStateCard message='Loading one time payments...' />}

      {isError && totalOneTimePayments > 0 && <ErrorState refetch={refetch} error={error} />}

      {!isLoading && !isError && totalOneTimePayments === 0 && <NotFoundState />}

      {!isLoading && !isError && totalOneTimePayments > 0 && data && (
        <div className='flex flex-col gap-4'>
          <span className='text-sm text-muted-foreground'>{rail.totalOneTimePayments.toString()} total</span>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Block Number</TableHead>
                  <TableHead className='text-right'>Total Amount</TableHead>
                  <TableHead className='text-right'>Net Payee Amount</TableHead>
                  <TableHead className='text-right'>Network Fees</TableHead>
                  <TableHead className='text-right'>Operator Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.oneTimePayments.map((oneTimePayment) => (
                  <TableRow key={oneTimePayment.id}>
                    <TableCell className='font-medium'>Epoch {oneTimePayment.blockNumber.toString()}</TableCell>
                    <TableCell className='text-right'>
                      {formatToken(oneTimePayment.totalAmount, rail.token.decimals, rail.token.symbol, 8)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatToken(oneTimePayment.netPayeeAmount, rail.token.decimals, rail.token.symbol, 8)}
                    </TableCell>
                    <TableCell className='text-right'>{formatFIL(oneTimePayment.networkFee)}</TableCell>
                    <TableCell className='text-right'>
                      {formatToken(oneTimePayment.operatorCommission, rail.token.decimals, rail.token.symbol, 8)}
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
      )}
    </RailOneTimePaymentsLayout>
  );
};
