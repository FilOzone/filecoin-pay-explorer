import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { AlertCircle } from "lucide-react";

export type OperatorsErrorStateProps = {
  error: Error;
  onRetry: () => void;
};

function OperatorsErrorState({ error, onRetry }: OperatorsErrorStateProps) {
  return (
    <EmptyStateCard
      icon={AlertCircle}
      title='Failed to load operators'
      titleTag='h2'
      description={error?.message || "Something went wrong"}
    >
      <Button onClick={onRetry} variant='primary'>
        Retry
      </Button>
    </EmptyStateCard>
  );
}

export default OperatorsErrorState;
