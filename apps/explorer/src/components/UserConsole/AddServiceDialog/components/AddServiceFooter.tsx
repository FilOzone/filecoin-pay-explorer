import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { DialogFooter } from "@filecoin-pay/ui/components/dialog";
import { Loader2 } from "lucide-react";
import type { TransactionLifecycleStage } from "@/hooks/useIndexedTransaction";

export interface AddServiceFooterProps {
  stage: TransactionLifecycleStage;
  canSubmit: boolean;
  isDepositing: boolean;
  /** Starts a submission from review. */
  onSubmit: () => void;
  /** Closes the dialog — an unsubmitted form is discarded, tracked progress isn't. */
  onDismiss: () => void;
  /** Resets a failed run for another attempt. */
  onTryAgain: () => void;
}

export const AddServiceFooter: React.FC<AddServiceFooterProps> = ({
  stage,
  canSubmit,
  isDepositing,
  onSubmit,
  onDismiss,
  onTryAgain,
}) => {
  if (stage === "review") {
    return (
      <DialogFooter>
        <Button variant='ghost' onClick={onDismiss} size='compact'>
          Cancel
        </Button>
        <Button variant='primary' onClick={onSubmit} disabled={!canSubmit} size='compact'>
          {isDepositing ? "Deposit and Add Service" : "Add Service"}
        </Button>
      </DialogFooter>
    );
  }

  if (stage === "awaiting-signature") {
    return (
      <DialogFooter>
        <Button variant='ghost' disabled size='compact'>
          Cancel
        </Button>
        <Button variant='primary' disabled size='compact'>
          <span className='flex items-center gap-2'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Waiting for wallet…
          </span>
        </Button>
      </DialogFooter>
    );
  }

  if (stage === "failed") {
    return (
      <DialogFooter>
        <Button variant='ghost' onClick={onDismiss} size='compact'>
          Close
        </Button>
        <Button variant='primary' onClick={onTryAgain} size='compact'>
          Try again
        </Button>
      </DialogFooter>
    );
  }

  if (stage === "complete") {
    return (
      <DialogFooter>
        <Button variant='primary' onClick={onDismiss} size='compact'>
          Done
        </Button>
      </DialogFooter>
    );
  }

  // Post-broadcast progress is persisted, so the dialog can close safely.
  return (
    <DialogFooter>
      <Button variant='ghost' onClick={onDismiss} size='compact'>
        Close
      </Button>
    </DialogFooter>
  );
};
