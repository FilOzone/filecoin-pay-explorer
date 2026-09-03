"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@filecoin-pay/ui/components/dialog";
import { AlertTriangle } from "lucide-react";
import type { MockDataset } from "../data/mockDatasets";
import { formatUSD } from "../utils/datasetLifecycle";

type ReleaseDatasetDialogProps = {
  dataset: MockDataset | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * "Release and stop paying": the deliberate alternative to letting a dataset
 * die by insolvency. Ends the dataset's rails, unlocks the remaining lockup,
 * and (in the real flow) emails a receipt via the notification service.
 */
export const ReleaseDatasetDialog = ({ dataset, onCancel, onConfirm }: ReleaseDatasetDialogProps) => (
  <Dialog open={dataset !== null} onOpenChange={(o) => !o && onCancel()}>
    <DialogContent className='max-w-sm'>
      <div className='flex flex-col items-center gap-4 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30'>
          <AlertTriangle className='h-6 w-6 text-orange-500' />
        </div>
        <DialogHeader>
          <DialogTitle>Release {dataset?.name}?</DialogTitle>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          Storage payments for this dataset stop and providers will no longer keep it. This cannot be undone once
          providers drop the data.
        </p>
        <p className='text-sm text-muted-foreground'>
          {dataset ? formatUSD(dataset.lockedUSD) : null} of locked deposit returns to your available balance. A receipt
          goes to your alerts email.
        </p>
      </div>
      <DialogFooter className='flex-row gap-3 sm:justify-stretch'>
        <Button variant='ghost' onClick={onCancel} className='flex-1'>
          Keep dataset
        </Button>
        <Button
          variant='ghost'
          onClick={onConfirm}
          className='flex-1 border border-destructive text-destructive hover:text-destructive'
        >
          Release and stop paying
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
