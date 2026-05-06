"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { RefreshOverlay } from "@filecoin-foundation/ui-filecoin/RefreshOverlay";
import { AlertCircle, SearchIcon } from "lucide-react";
import { StyledLink } from "@/components/shared";
import { calibration, mainnet } from "@/constants/chains";
import useAccountsLeaderboard from "@/hooks/useAccountsLeaderboard";
import useNetwork from "@/hooks/useNetwork";
import TopEarnersTable from "./components/TopEarnersTable";
import TopSpendersTable from "./components/TopSpendersTable";

const TopAccounts = () => {
  const { network } = useNetwork();
  const token = network === "mainnet" ? mainnet.contracts.usdfc.address : calibration.contracts.usdfc.address;
  const { data, isLoading, isError, error, isRefetching, refetch } = useAccountsLeaderboard(10, token);

  const isEmpty = data && data.topEarners.length === 0 && data.topSpenders.length === 0;

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

        {data && !isEmpty && (
          <RefreshOverlay isRefetching={isRefetching}>
            <div className='flex items-center justify-between gap-6'>
              <TopEarnersTable data={data.topEarners} />
              <TopSpendersTable data={data.topSpenders} />
            </div>
          </RefreshOverlay>
        )}

        {!isLoading && data && isEmpty && <EmptyState />}
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
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

const EmptyState = () => (
  <EmptyStateCard
    icon={SearchIcon}
    title='No accounts found'
    titleTag='h2'
    description='There are no accounts to display at the moment.'
  />
);

export default TopAccounts;
