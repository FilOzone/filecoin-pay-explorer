"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Rail } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { AlertCircle, Info } from "lucide-react";
import { useState } from "react";
import { useRailRateChanges } from "@/hooks/useRailDetails";
import RailRateChangesTable from "./RailRateChangesTable";

interface RailRateChangesLayoutProps {
  children: React.ReactNode;
}

const RailRateChangesLayout: React.FC<RailRateChangesLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-20'>
      <h3 className='text-2xl font-medium'>Rate Change Queue</h3>
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
    title='Failed to load rate changes'
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
    title='No rate changes found'
    titleTag='h2'
    description={`This rail has no scheduled rate changes.`}
  ></EmptyStateCard>
);

interface RailRateChangesProps {
  rail: Rail;
}

export const RailRateChanges: React.FC<RailRateChangesProps> = ({ rail }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useRailRateChanges(rail.id, page);

  const totalRateChanges = Number(rail.totalRateChanges);
  const totalPages = Math.ceil(totalRateChanges / 10);

  return (
    <RailRateChangesLayout>
      {isLoading && totalRateChanges > 0 && <LoadingStateCard message='Loading Rate Changes...' />}

      {isError && totalRateChanges > 0 && <ErrorState refetch={refetch} error={error} />}

      {!isLoading && !isError && totalRateChanges === 0 && <NotFoundState />}

      {!isLoading && !isError && totalRateChanges > 0 && data && (
        <div className='flex flex-col gap-4'>
          <span className='text-sm text-muted-foreground'>{rail.totalRateChanges.toString()} total</span>

          <RailRateChangesTable data={data.rateChanges} />

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
    </RailRateChangesLayout>
  );
};
