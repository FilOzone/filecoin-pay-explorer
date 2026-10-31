import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";

export function StaleQueueErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load inactive datasets'
      description='Unable to check for inactive datasets. Please try again.'
    />
  );
}
