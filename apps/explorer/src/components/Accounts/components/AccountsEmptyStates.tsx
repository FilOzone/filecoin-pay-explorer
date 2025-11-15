import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";

export function AccountsEmptyInitial() {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No accounts found</EmptyTitle>
            <EmptyDescription>There are no accounts to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  );
}

export type AccountsEmptyNoResultsProps = {
  onClear: () => void;
};

export function AccountsEmptyNoResults({ onClear }: AccountsEmptyNoResultsProps) {
  return (
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results found</EmptyTitle>
            <EmptyDescription>
              No account found with this address. Make sure the address is correct and try again.
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
