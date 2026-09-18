import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { FileTextIcon, SearchIcon } from "lucide-react";

export function RailsLoadingState() {
  return <LoadingStateCard message='Loading payment rails...' />;
}

export function RailsErrorState() {
  return (
    <ErrorStateCard
      titleTag='h2'
      title='Failed to load rails'
      description='Unable to fetch your payment rails. Please try again.'
    />
  );
}

export function RailsEmptyInitial() {
  return (
    <EmptyStateCard
      titleTag='h2'
      title='No payment rails'
      description='This service has not opened any payment rails for your account yet.'
      icon={FileTextIcon}
    />
  );
}

export function RailsEmptyNoResults() {
  return (
    <EmptyStateCard
      titleTag='h2'
      title='No results found'
      description='No rails with this service match that rail ID or payee address.'
      icon={SearchIcon}
    />
  );
}
