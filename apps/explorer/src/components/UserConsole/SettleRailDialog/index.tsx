import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Rail } from "@filecoin-pay/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { formatAddress } from "@/utils/formatter";
import { InlineTextLoader, RailStateBadge, RoleIndicator } from "../../shared";
import { SettlementDetails } from "./SettlementDetails";
import { SettlementNotices } from "./SettlementNotices";
import { type SettleRail, useSettleRailDialog } from "./useSettleRailDialog";

interface SettleRailDialogProps {
  rail: Rail;
  userAddress: string;
  settlementEpoch?: bigint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSettling?: boolean;
  settleRail: SettleRail;
}

export const SettleRailDialog: React.FC<SettleRailDialogProps> = ({
  rail,
  userAddress,
  settlementEpoch,
  open,
  onOpenChange,
  isSettling = false,
  settleRail,
}) => {
  const settlement = useSettleRailDialog({
    rail,
    userAddress,
    settlementEpoch,
    open,
    isSettling,
    settleRail,
    onSettled: () => onOpenChange(false),
  });

  const confirmButtonContent = isSettling ? <InlineTextLoader text='Settling...' /> : "Confirm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px] max-h-[90vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Settle Rail #{rail.railId.toString()}</DialogTitle>
          <DialogDescription>Confirm settlement for all pending payments up to the selected epoch.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4 overflow-y-auto'>
          <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
            <div className='flex items-center gap-2'>
              <RoleIndicator role={settlement.role} />
              <RailStateBadge state={rail.state} />
            </div>
            <div className='text-xs text-muted-foreground'>Operator: {formatAddress(rail.operator.address)}</div>
          </div>

          <SettlementDetails
            rail={rail}
            settlementEpoch={settlement.settlementEpoch}
            settledUptoEpoch={settlement.settledUptoEpoch}
            epochsSinceLastSettlement={settlement.epochsSinceLastSettlement}
            settlementAmountState={settlement.settlementAmountState}
          />

          <SettlementNotices
            settlementAmountStatus={settlement.settlementAmountState.status}
            showNoUnsettledWarning={settlement.settlementEligibility.status === "settled"}
          />
        </div>

        <DialogFooter className='flex-col sm:flex-row gap-2'>
          <Button variant='ghost' onClick={() => onOpenChange(false)} className='w-full sm:w-auto'>
            Cancel
          </Button>
          <Button
            variant='primary'
            onClick={settlement.handleSettle}
            disabled={!settlement.canSettle}
            className='w-full sm:w-auto'
          >
            {confirmButtonContent}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
