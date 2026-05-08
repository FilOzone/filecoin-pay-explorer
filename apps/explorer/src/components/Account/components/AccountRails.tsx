import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Account } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { AlertCircle, CircleQuestionMark } from "lucide-react";
import { useState } from "react";
import { useAccountRails } from "@/hooks/useAccountDetails";
import AccountRailsTable from "./AccountRailsTable";

interface AccountRailsLayoutProps {
  children: React.ReactNode;
}

const AccountRailsLayout: React.FC<AccountRailsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-20'>{children}</div>
  </PageSection>
);

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load Account Rails'
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
    icon={CircleQuestionMark}
    title='No rails found'
    titleTag='h2'
    description='This account is not part of any payment rails yet.'
  ></EmptyStateCard>
);

interface AccountRailsProps {
  account: Account;
}

export const AccountRails: React.FC<AccountRailsProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, error } = useAccountRails(account.id, page);

  const totalPages = account.totalRails ? Math.ceil(Number(account.totalRails) / 10) : 1;

  return (
    <AccountRailsLayout>
      {isLoading && <LoadingStateCard message='Loading Account Rails...' />}
      {isError && <ErrorState refetch={refetch} error={error} />}
      {!isLoading && !isError && (!data || data.rails.length === 0) && <NotFoundState />}

      {!isLoading && !isError && data && data.rails.length > 0 && (
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-2xl font-semibold'>Rails</h2>
            <span className='text-sm text-muted-foreground'>{account.totalRails.toString()} total</span>
          </div>

          <AccountRailsTable data={data.rails.map((rail) => ({ ...rail, account }))} />

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
    </AccountRailsLayout>
  );
};
