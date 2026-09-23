import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";

export function StaleQueueLoadingState() {
  return <LoadingStateCard message='Checking for inactive datasets...' />;
}

export function StaleQueueErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load inactive datasets'
      description='Unable to check for inactive datasets. Please try again.'
    />
  );
}
