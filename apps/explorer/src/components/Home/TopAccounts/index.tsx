"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { RefreshOverlay } from "@filecoin-foundation/ui-filecoin/RefreshOverlay";
import { AlertCircle, Search } from "lucide-react";
import { StyledLink } from "@/components/shared";
import useAccountsLeaderboard from "@/hooks/useAccountsLeaderboard";
import TopAccountsTable from "./components/TopAccountsTable";

const TopAccounts = () => {
  const { data, isLoading, isError, error, isRefetching, refetch } = useAccountsLeaderboard(10, "totalRails");

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-6 -mt-20'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-medium'>Accounts Leaderboard</h2>
          <StyledLink to='/accounts' className='text-sm'>
            View All
          </StyledLink>
        </div>

        {isLoading && <LoadingStateCard message='Loading Top Accounts...' />}

        {isError && <ErrorState refetch={refetch} error={error} />}

        {data && data.length > 0 && (
          <RefreshOverlay isRefetching={isRefetching}>
            <TopAccountsTable data={data} />
          </RefreshOverlay>
        )}

        {!isLoading && data && data.length === 0 && <EmptyState />}
      </div>
    </PageSection>
  );
};

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load accounts'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary'>
      Retry
    </Button>
  </EmptyStateCard>
);

const EmptyState = () => (
  <EmptyStateCard
    icon={Search}
    title='No accounts found'
    titleTag='h2'
    description='There are no accounts to display at the moment.'
  />
);

export default TopAccounts;
