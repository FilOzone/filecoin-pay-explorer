"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Address } from "@filecoin-pay/types";
import { AlertCircle, CircleQuestionMark } from "lucide-react";
import { useParams } from "next/navigation";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { AccountApprovals } from "./components/AccountApprovals";
import { AccountOverview } from "./components/AccountOverview";
import { AccountRails } from "./components/AccountRails";
import { AccountTokens } from "./components/AccountTokens";

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load Account'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

interface NotFoundStateProps {
  address: Address;
}

const NotFoundState: React.FC<NotFoundStateProps> = ({ address }) => (
  <EmptyStateCard
    icon={CircleQuestionMark}
    title='Account not found'
    titleTag='h2'
    description={`Account with address "${address}" does not exist or has not been indexed yet.`}
  ></EmptyStateCard>
);

export default function Account() {
  const { address } = useParams<{ address: Address }>();

  const { data, error, isLoading, isError, refetch } = useAccountDetails(address);

  return (
    <>
      {(!isLoading && !isError && data && (
        <>
          <AccountOverview account={data} />
          <AccountTokens account={data} />
          <AccountApprovals account={data} />
          <AccountRails account={data} />
        </>
      )) || (
        <PageSection backgroundVariant='light'>
          {isLoading && <LoadingStateCard message='Loading Account...' />}
          {isError && <ErrorState refetch={refetch} error={error} />}
          {!isLoading && !isError && !data && <NotFoundState address={address} />}
        </PageSection>
      )}
    </>
  );
}
