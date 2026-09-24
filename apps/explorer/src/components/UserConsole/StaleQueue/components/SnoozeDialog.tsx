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
import { formatDateTime } from "@/utils/formatter";
import { resolveSnoozeUntil, SNOOZE_PRESETS, snoozeDateRange } from "../data/snooze";

const FIELD_CLASS = "rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm";

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
  const dateRange = snoozeDateRange(nowMs);

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
          <select
            id='snooze-duration'
            className={FIELD_CLASS}
            value={presetIndex}
            onChange={(e) => setPresetIndex(e.target.value)}
          >
            {SNOOZE_PRESETS.map((preset, i) => (
              <option key={preset.label} value={String(i)}>
                {preset.label}
              </option>
            ))}
            <option value='custom'>Custom date…</option>
          </select>
          {presetIndex === "custom" ? (
            <input
              type='date'
              aria-label='Snooze until'
              className={FIELD_CLASS}
              min={dateRange.min}
              max={dateRange.max}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          ) : null}
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
