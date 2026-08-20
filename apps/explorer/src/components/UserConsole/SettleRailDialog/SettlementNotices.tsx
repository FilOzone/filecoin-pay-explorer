import { AlertCircle, Info } from "lucide-react";
import type { SettlementAmountState } from "./useSettleRailDialog";

interface SettlementNoticesProps {
  settlementAmountStatus: SettlementAmountState["status"];
  showNoUnsettledWarning: boolean;
}

export const SettlementNotices = ({ settlementAmountStatus, showNoUnsettledWarning }: SettlementNoticesProps) => (
  <>
    <div className='flex gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20'>
      <Info className='h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5' />
      <p className='text-xs text-blue-600 dark:text-blue-400 leading-relaxed'>
        Calculated from the current on-chain state. The amount may change before confirmation.
      </p>
    </div>

    {settlementAmountStatus === "error" && (
      <div className='flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20'>
        <AlertCircle className='h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5' />
        <p className='text-xs text-red-600 dark:text-red-400'>
          Unable to calculate the settlement amount. Close the dialog and try again.
        </p>
      </div>
    )}

    {showNoUnsettledWarning && (
      <div className='flex gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20'>
        <AlertCircle className='h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5' />
        <p className='text-xs text-orange-600 dark:text-orange-400'>
          The rail is already settled up to the selected epoch.
        </p>
      </div>
    )}
  </>
);
