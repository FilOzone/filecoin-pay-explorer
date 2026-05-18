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
import { useAccountTokens } from "@/hooks/useAccountDetails";
import AccountTokensTable from "./AccountTokensTable";

interface AccountTokensLayoutProps {
  children: React.ReactNode;
}

const AccountTokensLayout: React.FC<AccountTokensLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-30'>
      <h3 className='text-2xl font-medium'>Deposited Tokens</h3>
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
    title='Failed to load Deposited Tokens'
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
    title='No deposited tokens found'
    titleTag='h2'
    description='This account has not deposited any tokens yet.'
  ></EmptyStateCard>
);

interface AccountTokensProps {
  account: Account;
}

export const AccountTokens: React.FC<AccountTokensProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, error } = useAccountTokens(account.id, page);

  const totalPages = account.totalTokens ? Math.ceil(Number(account.totalTokens) / 10) : 1;

  return (
    <AccountTokensLayout>
      {isLoading && <LoadingStateCard message='Loading Deposited Tokens...' />}
      {isError && <ErrorState refetch={refetch} error={error} />}
      {!isLoading && !isError && (!data || data.userTokens.length === 0) && <NotFoundState />}
      {!isLoading && !isError && data && data.userTokens.length > 0 && (
        <div className='flex flex-col gap-4'>
          <span className='text-sm text-muted-foreground'>{account.totalTokens.toString()} total</span>

          <AccountTokensTable data={data.userTokens} />

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
    </AccountTokensLayout>
  );
};
