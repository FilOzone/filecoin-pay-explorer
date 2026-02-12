import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
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
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";
import type { Hex } from "viem";
import { useRailSettlementCalculations } from "@/hooks/useRailSettlementCalculations";
import type { SettleRailParams } from "@/hooks/useRailSettlements";
import { formatAddress, formatToken } from "@/utils/formatter";
import { InlineTextLoader, RailStateBadge } from "../shared";

interface SettleRailDialogProps {
  rail: Rail;
  userAddress: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSettling?: boolean;
  settleRail: (params: SettleRailParams) => Promise<Hex | undefined>;
}

export const SettleRailDialog: React.FC<SettleRailDialogProps> = ({
  rail,
  userAddress,
  open,
  onOpenChange,
  isSettling = false,
  settleRail,
}) => {
  const {
    isPayer,
    currentEpoch,
    settledUptoEpoch,
    epochsSinceLastSettlement,
    expectedSettleAmount,
    isLoadingBlockNumber,
  } = useRailSettlementCalculations(rail, userAddress);

  const canSettle = !isSettling && !isLoadingBlockNumber && epochsSinceLastSettlement > 0n;

  const handleSettle = async () => {
    if (isLoadingBlockNumber || currentEpoch === 0n) {
      return;
    }
    try {
      await settleRail({
        railId: rail.railId,
        paymentRate: BigInt(rail.paymentRate),
        tokenSymbol: rail.token.symbol,
        tokenDecimals: Number(rail.token.decimals),
        settledUpto: settledUptoEpoch,
      });
      // Close dialog immediately after initiating settlement
      onOpenChange(false);
    } catch {
      // Error already handled by useRailSettlements hook with toast notifications
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px] max-h-[90vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Settle Rail #{rail.railId.toString()}</DialogTitle>
          <DialogDescription>Confirm settlement for all pending payments up to the current epoch.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4 overflow-y-auto'>
          {/* Rail Overview */}
          <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
            <div className='flex items-center gap-2'>
              <Badge variant={isPayer ? "tertiary" : "primary"} icon={isPayer ? ArrowUpRight : ArrowDownLeft}>
                {isPayer ? "Payer" : "Payee"}
              </Badge>
              <RailStateBadge state={rail.state} />
            </div>
            <div className='text-xs text-muted-foreground'>Operator: {formatAddress(rail.operator.address)}</div>
          </div>

          {/* Settlement Information */}
          <div className='grid gap-3 p-4 rounded-lg border'>
            <div className='grid gap-2 text-sm'>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>Current Epoch:</span>
                <span className='font-mono font-medium'>
                  {isLoadingBlockNumber ? "Loading..." : currentEpoch.toString()}
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>Settled Up To:</span>
                <span className='font-mono font-medium'>{settledUptoEpoch.toString()}</span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>Epochs to Settle:</span>
                <span className='font-mono font-medium'>
                  {isLoadingBlockNumber ? "Loading..." : epochsSinceLastSettlement.toString()}
                </span>
              </div>
              <div className='h-px bg-border my-1' />
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>Payment Rate:</span>
                <span className='font-mono font-medium'>
                  {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>Historical Settled:</span>
                <span className='font-mono font-medium'>
                  {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
                </span>
              </div>
              <div className='h-px bg-border my-1' />
              <div className='flex justify-between items-center py-2 px-3 rounded-md bg-primary/5'>
                <span className='font-medium'>Expected Amount:</span>
                <span className='font-mono font-semibold text-lg'>
                  {isLoadingBlockNumber
                    ? "Loading..."
                    : formatToken(expectedSettleAmount, rail.token.decimals, rail.token.symbol, 8)}
                </span>
              </div>
            </div>
          </div>

          {/* Estimate Disclaimer */}
          <div className='flex gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20'>
            <Info className='h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5' />
            <p className='text-xs text-blue-600 dark:text-blue-400 leading-relaxed'>
              Amount is an estimate and may vary on-chain based on rate changes and network conditions.
            </p>
          </div>

          {/* Warning */}
          {epochsSinceLastSettlement === 0n && (
            <div className='flex gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20'>
              <AlertCircle className='h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5' />
              <p className='text-xs text-orange-600 dark:text-orange-400'>
                The rail is already settled up to the current epoch.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className='flex-col sm:flex-row gap-2'>
          <Button variant='ghost' onClick={() => onOpenChange(false)} className='w-full sm:w-auto'>
            Cancel
          </Button>
          <Button
            variant='primary'
            onClick={handleSettle}
            disabled={!canSettle || isSettling}
            className='w-full sm:w-auto'
          >
            {isSettling ? <InlineTextLoader text='Settling...' /> : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
