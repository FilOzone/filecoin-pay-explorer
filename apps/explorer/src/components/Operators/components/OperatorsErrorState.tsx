import { Heading } from "@filecoin-foundation/ui-filecoin/Heading";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { AlertCircle } from "lucide-react";

export type OperatorsErrorStateProps = {
  error: Error;
  onRetry: () => void;
};

function OperatorsErrorState({ error, onRetry }: OperatorsErrorStateProps) {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <Heading tag='h1' variant='page-heading'>
          Operators
        </Heading>
        <Card>
          <div className='py-16'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <AlertCircle />
                </EmptyMedia>
                <EmptyTitle>Failed to load operators</EmptyTitle>
                <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={onRetry}>Retry</Button>
              </EmptyContent>
            </Empty>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default OperatorsErrorState;
