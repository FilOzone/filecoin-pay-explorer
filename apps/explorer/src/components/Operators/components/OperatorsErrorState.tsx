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
    <Card>
      <div className='py-16'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon' className='text-brand-error'>
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle className='text-brand-error'>Failed to load operators</EmptyTitle>
            <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onRetry}>Retry</Button>
          </EmptyContent>
        </Empty>
      </div>
    </Card>
  );
}

export default OperatorsErrorState;
