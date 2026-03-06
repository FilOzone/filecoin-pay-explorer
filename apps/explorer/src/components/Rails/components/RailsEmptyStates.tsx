import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { Search } from "lucide-react";

export function RailsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={Search}
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
      icon={Search}
      title='No results found'
      titleTag='h2'
      description="Try adjusting your search filters to find what you're looking for."
    >
      <Button onClick={onClear} variant='ghost'>
        Clear Filters
      </Button>
    </EmptyStateCard>
  );
}
