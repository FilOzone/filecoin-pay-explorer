import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { FileTextIcon, SearchIcon } from "lucide-react";
import RailsSectionLayout from "./RailsSectionLayout";

export function RailsLoadingState() {
  return (
    <RailsSectionLayout>
      <LoadingStateCard message='Loading payment rails...' />
    </RailsSectionLayout>
  );
}

export function RailsErrorState() {
  return (
    <RailsSectionLayout>
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load rails'
        description='Unable to fetch your payment rails. Please try again.'
      />
    </RailsSectionLayout>
  );
}

export function RailsEmptyInitial() {
  return (
    <RailsSectionLayout>
      <EmptyStateCard
        titleTag='h2'
        title='No payment rails'
        description='This service has not opened any payment rails for your account yet.'
        icon={FileTextIcon}
      />
    </RailsSectionLayout>
  );
}

export function RailsEmptyNoResults() {
  return (
    <RailsSectionLayout>
      <EmptyStateCard
        titleTag='h2'
        title='No results found'
        description='No rails on this page match that rail ID. Try another page or a different ID.'
        icon={SearchIcon}
      />
    </RailsSectionLayout>
  );
}
