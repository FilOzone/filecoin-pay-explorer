import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { useState } from "react";
import { ExpiryPicker } from "@/components/shared/ExpiryPicker";
import { formatDateTime } from "@/utils/formatter";
import { resolveSnoozeUntil, SNOOZE_PRESETS, snoozeDateRange } from "../data/snooze";

interface SnoozeDialogProps {
  dataSetId: string;
  onCancel: () => void;
  onConfirm: (mutedUntil: number) => void;
}

/** Mounted only while open, so each opening starts from the first preset. */
export function SnoozeDialog({ dataSetId, onCancel, onConfirm }: SnoozeDialogProps) {
  const [presetIndex, setPresetIndex] = useState("0");
  const [customDate, setCustomDate] = useState("");

  const nowMs = Date.now();
  const mutedUntil = resolveSnoozeUntil(presetIndex, customDate, nowMs);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>Keep dataset #{dataSetId}</DialogTitle>
          <DialogDescription>
            Mutes inactivity alerts for this dataset. If it is still inactive when the snooze ends, it comes back to
            this list.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='snooze-duration'>Snooze for</Label>
          <ExpiryPicker
            id='snooze-duration'
            presets={SNOOZE_PRESETS}
            presetIndex={presetIndex}
            customDate={customDate}
            onPresetIndexChange={setPresetIndex}
            onCustomDateChange={setCustomDate}
            customDateLabel='Snooze until'
            customDateRange={snoozeDateRange(nowMs)}
          />
          <p className='text-xs text-muted-foreground'>
            {mutedUntil === null
              ? "Pick a date within the next year."
              : `Alerts resume after ${formatDateTime(Number(mutedUntil) * 1000)}.`}
          </p>
        </div>

        <DialogFooter className='flex-row gap-3 sm:justify-stretch'>
          <Button variant='ghost' onClick={onCancel} className='flex-1'>
            Cancel
          </Button>
          <Button
            variant='primary'
            disabled={mutedUntil === null}
            onClick={() => mutedUntil !== null && onConfirm(Number(mutedUntil))}
            className='flex-1'
          >
            Keep
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
