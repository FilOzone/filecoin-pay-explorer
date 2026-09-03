import { AlertCircle, Info } from "lucide-react";
import type { SettlementAmountState } from "./useSettleRailDialog";

interface SettlementNoticesProps {
  settlementAmountStatus: SettlementAmountState["status"];
  showNoUnsettledWarning: boolean;
}

export const SettlementNotices = ({ settlementAmountStatus, showNoUnsettledWarning }: SettlementNoticesProps) => (
  <>
    <div className='flex gap-2 rounded-lg border p-3'>
      <Info aria-hidden className='mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground' />
      <p className='text-xs leading-relaxed text-muted-foreground'>
        Calculated from the current on-chain state. The amount may change before confirmation.
      </p>
    </div>

    {settlementAmountStatus === "error" && (
      <div className='flex gap-2 rounded-lg border border-destructive/30 p-3' role='alert'>
        <AlertCircle aria-hidden className='mt-0.5 h-4 w-4 flex-shrink-0 text-destructive' />
        <p className='text-xs text-destructive'>
          Unable to calculate the settlement amount. Close the dialog and try again.
        </p>
      </div>
    )}

    {showNoUnsettledWarning && (
      <div className='flex gap-2 rounded-lg border p-3'>
        <AlertCircle aria-hidden className='mt-0.5 h-4 w-4 flex-shrink-0 text-destructive' />
        <p className='text-xs'>The rail is already settled up to the selected epoch.</p>
      </div>
    )}
  </>
);
