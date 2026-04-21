import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { SearchIcon } from "lucide-react";

export function RailsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title='No rails found'
      titleTag='h2'
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
      icon={SearchIcon}
      title='No results found'
      titleTag='h2'
      description="Try adjusting your search filters to find what you're looking for."
    >
      <Button onClick={onClear} variant='ghost' size='compact'>
        Clear Filters
      </Button>
    </EmptyStateCard>
  );
}
