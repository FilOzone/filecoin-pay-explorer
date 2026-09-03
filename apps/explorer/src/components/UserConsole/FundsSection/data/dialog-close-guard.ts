import { toast } from "sonner";

/**
 * Builds a Dialog onOpenChange handler that refuses to close while work is in
 * flight. `blockReason` returns the message to show, or null when closing is
 * fine; `onClose` does the dialog's own teardown (restoring the wallet network
 * and so on) before it reports closed.
 */
export function createDialogCloseGuard({
  blockReason,
  onClose,
  onOpen,
}: {
  blockReason: () => string | null;
  onClose: () => void;
  onOpen: () => void;
}): (nextOpen: boolean) => void {
  return (nextOpen) => {
    if (nextOpen) {
      onOpen();
      return;
    }
    const reason = blockReason();
    if (reason) {
      toast.info(reason);
      return;
    }
    onClose();
  };
}
