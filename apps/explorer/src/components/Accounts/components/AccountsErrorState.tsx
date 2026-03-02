import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { AlertCircle } from "lucide-react";

export type AccountsErrorStateProps = {
  error: Error;
  onRetry: () => void;
};

function AccountsErrorState({ error, onRetry }: AccountsErrorStateProps) {
  return (
    <EmptyStateCard
      icon={AlertCircle}
      title='Failed to load accounts'
      titleTag='h3'
      description={error?.message || "Something went wrong"}
    >
      <Button onClick={onRetry} variant='primary'>
        Retry
      </Button>
    </EmptyStateCard>
  );
}

export default AccountsErrorState;
