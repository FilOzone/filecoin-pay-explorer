import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { DatabaseIcon } from "lucide-react";

export function DatasetsLoadingState() {
  return <LoadingStateCard message='Loading data sets...' />;
}

export function DatasetsErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load data sets'
      description='Unable to fetch your Warm Storage data sets. Please try again.'
    />
  );
}

export function DatasetsEmptyState() {
  return (
    <EmptyStateCard
      titleTag='h2'
      title='No data sets'
      description='This service has no data sets for your account yet.'
      icon={DatabaseIcon}
    />
  );
}
