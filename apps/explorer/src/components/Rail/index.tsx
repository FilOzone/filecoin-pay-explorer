"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { AlertCircle, CircleQuestionMark } from "lucide-react";
import { useParams } from "next/navigation";
import { useRailDetails } from "@/hooks/useRailDetails";
import { RailOneTimePayments } from "./components/RailOneTimePayments";
import { RailRateChanges } from "./components/RailRateChanges";
import { RailSettlements } from "./components/RailSettlements";
import { Stats } from "./components/Stats";

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load Rail'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

interface NotFoundStateProps {
  railId: string;
}

const NotFoundState: React.FC<NotFoundStateProps> = ({ railId }) => (
  <EmptyStateCard
    icon={CircleQuestionMark}
    title='Rail not found'
    titleTag='h2'
    description={`Rail with ID "${railId}" does not exist or has not been indexed yet.`}
  ></EmptyStateCard>
);

export default function Rail() {
  const { id: railId } = useParams<{ id: string }>();

  const { data, error, isLoading, isError, refetch } = useRailDetails(railId);

  return (
    <>
      {(!isLoading && !isError && data && (
        <>
          <Stats rail={data} />
          <RailRateChanges rail={data} />
          <RailSettlements rail={data} />
          <RailOneTimePayments rail={data} />
        </>
      )) || (
        <PageSection backgroundVariant='light'>
          {isLoading && <LoadingStateCard message='Loading Rail...' />}
          {isError && <ErrorState refetch={refetch} error={error} />}
          {!isLoading && !isError && !data && <NotFoundState railId={railId} />}
        </PageSection>
      )}
    </>
  );
}
