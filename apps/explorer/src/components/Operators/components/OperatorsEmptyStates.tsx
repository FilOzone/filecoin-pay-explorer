import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { SearchIcon } from "lucide-react";

export function OperatorsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title='No operators found'
      titleTag='h2'
      description='There are no operators to display at the moment.'
    />
  );
}

export type OperatorsEmptyNoResultsProps = {
  onClear: () => void;
};

export function OperatorsEmptyNoResults({ onClear }: OperatorsEmptyNoResultsProps) {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title='No results found'
      titleTag='h2'
      description='No operator found with this address. Make sure the address is correct and try again.'
    >
      <Button onClick={onClear} variant='ghost' size='compact'>
        Clear Search
      </Button>
    </EmptyStateCard>
  );
}
