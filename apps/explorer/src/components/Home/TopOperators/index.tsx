"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { RefreshOverlay } from "@filecoin-foundation/ui-filecoin/RefreshOverlay";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { AlertCircle } from "lucide-react";
import { StyledLink } from "@/components/shared";
import useOperatorsLeaderboard from "@/hooks/useOperatorsLeaderboard";
import TopOperatorsTable from "./components/TopOperatorsTable";

const TopOperators = () => {
  const { data, isLoading, isError, error, isRefetching, refetch } = useOperatorsLeaderboard(10, "totalRails");

  return (
    <PageSection backgroundVariant='light' paddingVariant='medium'>
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
  <Card>
    <div className='py-12'>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon' className='text-brand-error'>
            <AlertCircle />
          </EmptyMedia>
          <EmptyTitle className='text-brand-error'>Failed to load operators</EmptyTitle>
          <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={refetch}>Retry</Button>
        </EmptyContent>
      </Empty>
    </div>
  </Card>
);

const EmptyState = () => (
  <Card>
    <div className='py-12'>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No operators found</EmptyTitle>
          <EmptyDescription>There are no operators to display at the moment.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  </Card>
);

export default TopOperators;
