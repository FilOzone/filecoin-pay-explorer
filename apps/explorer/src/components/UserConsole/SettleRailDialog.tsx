import type { Rail } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { SETTLEMENT_FEE } from "@/utils/constants";
import { formatAddress, formatToken } from "@/utils/formatter";

interface SettleRailDialogProps {
  rail: Rail;
  userAddress: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettleRailDialog: React.FC<SettleRailDialogProps> = ({ rail, userAddress, open, onOpenChange }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: blockNumber, isLoading: isLoadingBlockNumber } = useBlockNumber({ watch: true });

  const { synapse, constants } = useSynapse();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  const isPayer = rail.payer.address.toLowerCase() === userAddress.toLowerCase();
  const expectedSettleAmount = blockNumber
    ? BigInt(rail.paymentRate) * (BigInt(blockNumber) - BigInt(rail.settledUpto))
    : 0n;

  const canSettle = isPayer && !isSubmitting && !isExecuting && !isLoadingBlockNumber;

  // TODO: Fix and test Rail settlement
  const handleSettle = async () => {
    if (!synapse) {
      console.log("Synapse not initialized");
      return;
    }
    try {
      setIsSubmitting(true);
      await execute({
        functionName: "settleRail",
        args: [rail.railId, blockNumber],
        value: SETTLEMENT_FEE,
        metadata: {
          type: "settleRail",
          railId: rail.railId.toString(),
          amount: formatToken(expectedSettleAmount, Number(rail.token.decimals)),
          token: rail.token.symbol,
        },
        onSubmitOnChain: () => onOpenChange(false),
      });
    } catch (error) {
      console.error("Settle failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Settle Rail #{rail.railId.toString()}</DialogTitle>
          <DialogDescription>Settle this payment rail and finalize the current state.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Rail Info */}
          <div className='grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50'>
            <div>
              <span className='text-xs text-muted-foreground'>Your Role</span>
              <div>
                <Badge variant={isPayer ? "destructive" : "default"}>{isPayer ? "Payer" : "Payee"}</Badge>
              </div>
            </div>
            <div>
              <span className='text-xs text-muted-foreground'>State</span>
              <div>
                <Badge
                  variant={
                    rail.state === "ACTIVE"
                      ? "default"
                      : rail.state === "ZERORATE"
                        ? "secondary"
                        : rail.state === "TERMINATED"
                          ? "destructive"
                          : "outline"
                  }
                >
                  {rail.state}
                </Badge>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className='grid gap-2 p-3 rounded-lg border'>
            <h4 className='text-sm font-medium'>Participants</h4>
            <div className='grid gap-2 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Payer:</span>
                <span className='font-mono'>{formatAddress(rail.payer.address)}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Payee:</span>
                <span className='font-mono'>{formatAddress(rail.payee.address)}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Operator:</span>
                <span className='font-mono'>{formatAddress(rail.operator.address)}</span>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className='grid gap-2 p-3 rounded-lg border'>
            <h4 className='text-sm font-medium'>Payment Details</h4>
            <div className='grid gap-2 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Token:</span>
                <span className='font-medium'>{rail.token.symbol}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Payment Rate:</span>
                <span className='font-medium'>
                  {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 15)}
                </span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Settled Amount:</span>
                <span className='font-medium'>
                  {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
                </span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Settled Upto:</span>
                <span className='font-medium'>{rail.settledUpto.toString()} epochs</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Expected Amount (until current epoch):</span>
                <span className='font-medium'>
                  {isLoadingBlockNumber
                    ? "Loading..."
                    : formatToken(expectedSettleAmount, rail.token.decimals, rail.token.symbol, 8)}
                </span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className='p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm text-orange-600 dark:text-orange-400'>
            <p>⚠️ Settling a rail will finalize the current payment state. This action may affect your balance.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting || isExecuting}>
            Cancel
          </Button>
          <Button onClick={handleSettle} disabled={!canSettle}>
            {isSubmitting || isExecuting ? "Settling..." : "Settle Rail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
