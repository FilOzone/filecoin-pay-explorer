import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { SearchXIcon } from "lucide-react";

export function ServiceLoadingState() {
  return <LoadingStateCard message='Loading service...' />;
}

export function ServiceErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load service'
      description='Unable to fetch this service. Please try again.'
    />
  );
}

/**
 * Shown when the connected payer has no indexed relationship with the operator,
 * and when the route segment is not an address at all. Both mean the same thing
 * to the reader: this is not one of their services.
 */
export function ServiceNotFoundState() {
  return (
    <EmptyStateCard
      titleTag='h2'
      icon={SearchXIcon}
      title='Service not found'
      description='This address is not one of your services. You have no payment rails or approvals with it on the connected network.'
    >
      <div className='mt-6 flex justify-center'>
        <Button variant='primary' size='compact' href='/console'>
          Back to Dashboard
        </Button>
      </div>
    </EmptyStateCard>
  );
}
