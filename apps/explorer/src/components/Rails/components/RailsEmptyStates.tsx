import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

export function RailsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={MagnifyingGlassIcon}
      title='No rails found'
      titleTag='h3'
      description='There are no rails to display at the moment.'
    />
  );
}

export type RailsEmptyNoResultsProps = {
  onClear: () => void;
};

export function RailsEmptyNoResults({ onClear }: RailsEmptyNoResultsProps) {
  return (
    <EmptyStateCard
      icon={MagnifyingGlassIcon}
      title='No results found'
      titleTag='h3'
      description="Try adjusting your search filters to find what you're looking for."
    >
      <Button onClick={onClear} variant='ghost'>
        Clear Filters
      </Button>
    </EmptyStateCard>
  );
}
