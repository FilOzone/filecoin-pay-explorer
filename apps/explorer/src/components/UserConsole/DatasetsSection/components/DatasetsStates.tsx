import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { DatabaseIcon } from "lucide-react";

export function DatasetsLoadingState() {
  return <LoadingStateCard message='Loading datasets...' />;
}

export function DatasetsErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load datasets'
      description='Unable to fetch your Warm Storage datasets. Please try again.'
    />
  );
}

export function DatasetsEmptyState() {
  return (
    <EmptyStateCard
      titleTag='h2'
      title='No datasets'
      description='This service has no datasets for your account yet.'
      icon={DatabaseIcon}
    />
  );
}
