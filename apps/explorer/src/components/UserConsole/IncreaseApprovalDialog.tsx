import type { OperatorApproval } from "@filecoin-pay/types";
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
import { Input } from "@filecoin-pay/ui/components/input";
import { Label } from "@filecoin-pay/ui/components/label";
import { Infinity as InfinityIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { maxUint256, parseUnits } from "viem";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress, formatToken, isUnlimitedValue } from "@/utils/formatter";

interface IncreaseApprovalDialogProps {
  approval: OperatorApproval;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IncreaseApprovalDialog: React.FC<IncreaseApprovalDialogProps> = ({ approval, open, onOpenChange }) => {
  const [lockupIncrease, setLockupIncrease] = useState("");
  const [rateIncrease, setRateIncrease] = useState("");
  const [maxLockupPeriodIncrease, setMaxLockupPeriodIncrease] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { synapse } = useSynapse();

  // Check if current allowances are already unlimited
  const isCurrentLockupUnlimited = isUnlimitedValue(approval.lockupAllowance);
  const isCurrentRateUnlimited = isUnlimitedValue(approval.rateAllowance);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setLockupIncrease("");
      setRateIncrease("");
      setIsUnlimited(false);
    }
  }, [open]);

  const handleIncrease = async () => {
    if (!isUnlimited && !lockupIncrease && !rateIncrease) {
      console.log("No increase values provided");
      return;
    }

    if (!synapse) {
      console.log("Synapse not initialized");
      return;
    }

    setIsSubmitting(true);

    const lockupIncreaseWei = isUnlimited
      ? maxUint256
      : lockupIncrease
        ? parseUnits(lockupIncrease, Number(approval.token.decimals)).toString()
        : "0";
    const rateIncreaseWei = isUnlimited
      ? maxUint256
      : rateIncrease
        ? parseUnits(rateIncrease, Number(approval.token.decimals)).toString()
        : "0";

    // Calculate new totals
    const newLockupAllowance = isUnlimited ? maxUint256 : BigInt(approval.lockupAllowance) + BigInt(lockupIncreaseWei);
    const newRateAllowance = isUnlimited ? maxUint256 : BigInt(approval.rateAllowance) + BigInt(rateIncreaseWei);
    const newMaxLockupPeriod = isUnlimited
      ? maxUint256
      : BigInt(approval.maxLockupPeriod) + BigInt(maxLockupPeriodIncrease);

    try {
      const tx = await synapse.payments.approveService(
        approval.operator.address,
        newRateAllowance,
        newLockupAllowance,
        newMaxLockupPeriod,
      );
      await tx.wait();
      setIsSubmitting(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Error increasing approval:", error);
      setIsSubmitting(false);
    }
  };

  const canSubmit = (isUnlimited || lockupIncrease || rateIncrease) && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Increase Approval</DialogTitle>
          <DialogDescription>Increase the allowances for this operator approval.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Approval Info */}
          <div className='grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50'>
            <div>
              <span className='text-xs text-muted-foreground'>Operator</span>
              <div className='font-mono text-sm font-medium'>{formatAddress(approval.operator.address)}</div>
            </div>
            <div>
              <span className='text-xs text-muted-foreground'>Token</span>
              <div className='font-medium'>{approval.token.symbol}</div>
            </div>
          </div>

          {/* Current Allowances */}
          <div className='grid gap-2 p-3 rounded-lg border'>
            <h4 className='text-sm font-medium'>Current Allowances</h4>
            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <span className='text-muted-foreground'>Lockup:</span>
                <div className='font-medium'>
                  {isCurrentLockupUnlimited ? (
                    <Badge variant='secondary' className='font-normal'>
                      <InfinityIcon className='h-3 w-3 mr-1' />
                      Unlimited
                    </Badge>
                  ) : (
                    formatToken(approval.lockupAllowance, approval.token.decimals, approval.token.symbol, 2)
                  )}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Rate:</span>
                <div className='font-medium'>
                  {isCurrentRateUnlimited ? (
                    <Badge variant='secondary' className='font-normal'>
                      <InfinityIcon className='h-3 w-3 mr-1' />
                      Unlimited
                    </Badge>
                  ) : (
                    formatToken(approval.rateAllowance, approval.token.decimals, approval.token.symbol, 2)
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Increase Values */}
          <div className='grid gap-3'>
            <div className='flex items-center justify-between'>
              <Label>Increase By</Label>
              <label className='flex items-center gap-2 text-sm cursor-pointer'>
                <input
                  type='checkbox'
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className='rounded'
                />
                Set to Unlimited
              </label>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <Label htmlFor='lockupIncrease' className='text-xs text-muted-foreground'>
                  Lockup Increase
                </Label>
                <Input
                  id='lockupIncrease'
                  type='number'
                  placeholder='0.0'
                  value={lockupIncrease}
                  onChange={(e) => setLockupIncrease(e.target.value)}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor='rateIncrease' className='text-xs text-muted-foreground'>
                  Rate Increase
                </Label>
                <Input
                  id='rateIncrease'
                  type='number'
                  placeholder='0.0'
                  value={rateIncrease}
                  onChange={(e) => setRateIncrease(e.target.value)}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor='maxLockupPeriodIncrease' className='text-xs text-muted-foreground'>
                  Maximum Lockup Period Increase
                </Label>
                <Input
                  id='maxLockupPeriodIncrease'
                  type='number'
                  placeholder='0.0'
                  value={maxLockupPeriodIncrease}
                  onChange={(e) => setMaxLockupPeriodIncrease(e.target.value)}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleIncrease} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </>
            ) : (
              "Increase"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
