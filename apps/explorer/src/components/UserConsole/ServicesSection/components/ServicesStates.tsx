import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { LayersIcon } from "lucide-react";
import ServicesSectionLayout from "./ServicesSectionLayout";

export function ServicesLoadingState() {
  return (
    <ServicesSectionLayout>
      <LoadingStateCard message='Loading your services...' />
    </ServicesSectionLayout>
  );
}

export function ServicesErrorState() {
  return (
    <ServicesSectionLayout>
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load services'
        description='Unable to fetch your services. Please try again.'
      />
    </ServicesSectionLayout>
  );
}

export function ServicesEmptyState() {
  return (
    <ServicesSectionLayout>
      <EmptyStateCard
        titleTag='h2'
        icon={LayersIcon}
        title='No services yet'
        description='Approve a service below to let it open payment rails on your behalf. Services you approve, and services you already have rails with, appear here.'
      />
    </ServicesSectionLayout>
  );
}
