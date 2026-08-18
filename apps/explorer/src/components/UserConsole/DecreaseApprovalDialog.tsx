import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import type { OperatorApproval } from "@filecoin-pay/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { formatRatePerMonth, formatToken, isUnlimitedValue } from "@/utils/formatter";

interface DecreaseApprovalDialogProps {
  approval: OperatorApproval;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Lowering an allowance is the same setOperatorApproval call as raising it —
// the contract takes absolute caps. New caps below current usage are valid:
// existing rails keep operating; the service just can't grow its usage.
export const DecreaseApprovalDialog: React.FC<DecreaseApprovalDialogProps> = ({ approval, open, onOpenChange }) => {
  const [newLockupAllowance, setNewLockupAllowance] = useState("");
  const [newRateAllowance, setNewRateAllowance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { synapse, constants } = useSynapse();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  useEffect(() => {
    if (!open) {
      setNewLockupAllowance("");
      setNewRateAllowance("");
    }
  }, [open]);

  const currentLockupLabel = isUnlimitedValue(approval.lockupAllowance)
    ? "Unlimited"
    : formatToken(approval.lockupAllowance, approval.token.decimals, approval.token.symbol, 4);
  const currentRateLabel = isUnlimitedValue(approval.rateAllowance)
    ? "Unlimited"
    : formatRatePerMonth(approval.rateAllowance, approval.token.decimals, approval.token.symbol);

  const handleDecrease = async () => {
    if (!newLockupAllowance && !newRateAllowance) return;
    if (!synapse) return;

    setIsSubmitting(true);

    // Empty input keeps the current cap; a value replaces it outright.
    const lockupAllowance = newLockupAllowance
      ? parseUnits(newLockupAllowance, Number(approval.token.decimals))
      : BigInt(approval.lockupAllowance);
    const rateAllowance = newRateAllowance
      ? parseUnits(newRateAllowance, Number(approval.token.decimals))
      : BigInt(approval.rateAllowance);

    try {
      await execute({
        functionName: "setOperatorApproval",
        args: [
          approval.token.id,
          approval.operator.address,
          true,
          rateAllowance,
          lockupAllowance,
          BigInt(approval.maxLockupPeriod),
        ],
        metadata: {
          type: "decreaseApproval",
          operator: approval.operator.address,
          token: approval.token.symbol,
        },
        onSubmitOnChain: () => onOpenChange(false),
      });
    } catch (error) {
      console.error("Decrease approval failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !isSubmitting && !isExecuting && (newLockupAllowance !== "" || newRateAllowance !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Decrease limits</DialogTitle>
          <DialogDescription>
            Set lower limits for this service. Empty fields keep their current value. Rails already running keep
            operating; the service just can't reserve or charge beyond the new caps.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 py-2'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='new-lockup-allowance'>New reserve limit ({approval.token.symbol})</Label>
            <Input
              id='new-lockup-allowance'
              type='number'
              min='0'
              placeholder='0.0'
              value={newLockupAllowance}
              onChange={(value) => setNewLockupAllowance(value)}
            />
            <span className='text-xs text-muted-foreground'>Current: {currentLockupLabel}</span>
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='new-rate-allowance'>New spend rate limit ({approval.token.symbol}/epoch)</Label>
            <Input
              id='new-rate-allowance'
              type='number'
              min='0'
              placeholder='0.0'
              value={newRateAllowance}
              onChange={(value) => setNewRateAllowance(value)}
            />
            <span className='text-xs text-muted-foreground'>Current: {currentRateLabel}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant='primary' onClick={handleDecrease} disabled={!canSubmit}>
            {isSubmitting || isExecuting ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Submitting
              </span>
            ) : (
              "Decrease limits"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
