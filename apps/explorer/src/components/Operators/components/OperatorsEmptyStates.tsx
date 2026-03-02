import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

export function OperatorsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={MagnifyingGlassIcon}
      title='No operators found'
      titleTag='h3'
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
      icon={MagnifyingGlassIcon}
      title='No results found'
      titleTag='h3'
      description='No operator found with this address. Make sure the address is correct and try again.'
    >
      <Button onClick={onClear} variant='ghost'>
        Clear Search
      </Button>
    </EmptyStateCard>
  );
}
