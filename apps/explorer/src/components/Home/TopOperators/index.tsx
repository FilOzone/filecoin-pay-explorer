"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { RefreshOverlay } from "@filecoin-foundation/ui-filecoin/RefreshOverlay";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import { StyledLink } from "@/components/shared";
import useOperatorsLeaderboard from "@/hooks/useOperatorsLeaderboard";
import TopOperatorsTable from "./components/TopOperatorsTable";

const TopOperators = () => {
  const { data, isLoading, isError, error, isRefetching, refetch } = useOperatorsLeaderboard(10, "totalRails");

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-6 -mt-20'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-medium'>Services Leaderboard</h2>
          <StyledLink to='/operators' className='text-sm'>
            View All
          </StyledLink>
        </div>

        {isLoading && <LoadingStateCard message='Loading Top Operators...' />}

        {isError && <ErrorState refetch={refetch} error={error} />}

        {data && data.length > 0 && (
          <RefreshOverlay isRefetching={isRefetching}>
            <TopOperatorsTable data={data} />
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
    title='Failed to load operators'
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
    icon={MagnifyingGlassIcon}
    title='No operators found'
    titleTag='h2'
    description='There are no operators to display at the moment.'
  />
);

export default TopOperators;
