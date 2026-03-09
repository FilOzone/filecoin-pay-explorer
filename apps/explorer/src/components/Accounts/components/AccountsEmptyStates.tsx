import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { SearchIcon } from "lucide-react";

export function AccountsEmptyInitial() {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title='No accounts found'
      titleTag='h2'
      description='There are no accounts to display at the moment.'
    />
  );
}

export type AccountsEmptyNoResultsProps = {
  onClear: () => void;
};

export function AccountsEmptyNoResults({ onClear }: AccountsEmptyNoResultsProps) {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title='No results found'
      titleTag='h2'
      description='No account found with this address. Make sure the address is correct and try again.'
    >
      <Button onClick={onClear} variant='ghost'>
        Clear Search
      </Button>
    </EmptyStateCard>
  );
}
