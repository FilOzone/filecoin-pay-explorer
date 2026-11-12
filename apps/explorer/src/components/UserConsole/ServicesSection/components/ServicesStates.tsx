import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { LayersIcon } from "lucide-react";

export function ServicesLoadingState() {
  return <LoadingStateCard message='Loading your services...' />;
}

export function ServicesErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load services'
      description='Unable to fetch your services. Please try again.'
    />
  );
}

export function ServicesEmptyState() {
  return (
    <EmptyStateCard
      titleTag='h2'
      icon={LayersIcon}
      title='No services yet'
      description='Add a service to let it open payment rails on your behalf. Services you approve, and services you already have rails with, appear here.'
    />
  );
}
