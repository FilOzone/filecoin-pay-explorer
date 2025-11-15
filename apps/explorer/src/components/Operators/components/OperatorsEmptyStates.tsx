import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";

export function OperatorsEmptyInitial() {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No operators found</EmptyTitle>
            <EmptyDescription>There are no operators to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  );
}

export type OperatorsEmptyNoResultsProps = {
  onClear: () => void;
};

export function OperatorsEmptyNoResults({ onClear }: OperatorsEmptyNoResultsProps) {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results found</EmptyTitle>
            <EmptyDescription>
              No operator found with this address. Make sure the address is correct and try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onClear} variant='outline'>
              Clear Search
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </Card>
  );
}
