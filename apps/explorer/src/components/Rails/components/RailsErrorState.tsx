import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { AlertCircle } from "lucide-react";

export type RailsErrorStateProps = {
  error: Error;
  onRetry: () => void;
};

function RailsErrorState({ error, onRetry }: RailsErrorStateProps) {
  return (
    <EmptyStateCard
      icon={AlertCircle}
      title='Failed to load rails'
      titleTag='h3'
      description={error?.message || "Something went wrong"}
    >
      <Button onClick={onRetry} variant='primary'>
        Retry
      </Button>
    </EmptyStateCard>
  );
}

export default RailsErrorState;
