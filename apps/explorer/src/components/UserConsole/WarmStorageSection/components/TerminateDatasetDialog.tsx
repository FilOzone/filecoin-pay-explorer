"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@filecoin-pay/ui/components/dialog";
import { AlertTriangle } from "lucide-react";
import { PocChip } from "@/components/UserConsole/PocChip";
import type { MockDataset } from "../data/mockDatasets";
import { formatUSD } from "../utils/datasetLifecycle";

type TerminateDatasetDialogProps = {
  dataset: MockDataset | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Terminating is the deliberate alternative to letting a dataset die by
 * insolvency: it ends the dataset's rails, unlocks the remaining lockup, and
 * (in the real flow) emails a receipt via the notification service.
 */
export const TerminateDatasetDialog = ({ dataset, onCancel, onConfirm }: TerminateDatasetDialogProps) => (
  <Dialog open={dataset !== null} onOpenChange={(o) => !o && onCancel()}>
    <DialogContent className='max-w-sm'>
      <div className='flex flex-col items-center gap-4 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30'>
          <AlertTriangle className='h-6 w-6 text-red-500' />
        </div>
        <DialogHeader>
          <DialogTitle>Terminate {dataset?.name}?</DialogTitle>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          This is not recoverable. Storage payments stop, providers stop proving the data and will drop it. Once
          dropped, the data cannot be brought back.
        </p>
        <p className='text-sm text-muted-foreground'>
          {dataset ? formatUSD(dataset.lockedUSD) : null} of locked deposit returns to your available balance. A receipt
          goes to your alerts email.
        </p>
        <PocChip label='action not wired — no transaction is sent; the row is removed locally' />
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
          Terminate dataset
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
