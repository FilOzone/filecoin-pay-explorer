import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { FileTextIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import RailsSectionLayout from "./RailsSectionLayout";

export function RailsEmptyInitial() {
  return (
    <RailsSectionLayout>
      <EmptyStateCard
        titleTag='h2'
        title='No payment rails'
        description="You don't have any active payment rails yet. Create a rail to start sending or receiving payments."
        icon={FileTextIcon}
      />
    </RailsSectionLayout>
  );
}

export function RailsEmptyNoResults({ searchFilter }: { searchFilter: string }) {
  return (
    <RailsSectionLayout>
      <EmptyStateCard
        titleTag='h2'
        title='No results found'
        description={`No rails match your search criteria. Try a different ${searchFilter}.`}
        icon={MagnifyingGlassIcon}
      />
    </RailsSectionLayout>
  );
}
