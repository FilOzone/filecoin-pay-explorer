"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@filecoin-pay/ui/components/dialog";
import { AlertTriangle } from "lucide-react";

interface UnsubscribeDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const UnsubscribeDialog = ({ open, onCancel, onConfirm }: UnsubscribeDialogProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
    <DialogContent className='max-w-sm'>
      <div className='flex flex-col items-center gap-4 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30'>
          <AlertTriangle className='h-6 w-6 text-orange-500' />
        </div>
        <DialogHeader>
          <DialogTitle>Turn off email alerts?</DialogTitle>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          You will no longer receive reminders when this account may need additional funds.
        </p>
        <p className='text-sm text-muted-foreground'>This won&apos;t affect your funds or services.</p>
      </div>
      <DialogFooter className='flex-row gap-3 sm:justify-stretch'>
        <Button variant='ghost' onClick={onCancel} className='flex-1'>
          Cancel
        </Button>
        <Button
          variant='ghost'
          onClick={onConfirm}
          className='flex-1 border border-destructive text-destructive hover:text-destructive'
        >
          Turn off alerts
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
