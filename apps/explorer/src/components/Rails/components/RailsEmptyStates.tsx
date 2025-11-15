import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";

export function RailsEmptyInitial() {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No rails found</EmptyTitle>
            <EmptyDescription>There are no rails to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  );
}

export type RailsEmptyNoResultsProps = {
  onClear: () => void;
};

export function RailsEmptyNoResults({ onClear }: RailsEmptyNoResultsProps) {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results found</EmptyTitle>
            <EmptyDescription>Try adjusting your search filters to find what you're looking for.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onClear} variant='outline'>
              Clear Filters
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </Card>
  );
}
