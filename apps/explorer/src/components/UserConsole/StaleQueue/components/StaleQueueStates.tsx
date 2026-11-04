import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";

export function StaleQueueErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load inactive data sets'
      description='Unable to check for inactive data sets. Please try again.'
    />
  );
}
