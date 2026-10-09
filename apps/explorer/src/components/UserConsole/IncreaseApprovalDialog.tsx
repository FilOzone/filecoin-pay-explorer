import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
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
import { Infinity as InfinityIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { getChain } from "@/constants/chains";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { Network } from "@/types";
import { computeIncreasedApproval } from "@/utils/approvalIncrease";
import { formatAddress, formatToken, isUnlimitedValue } from "@/utils/formatter";

interface IncreaseApprovalDialogProps {
  approval: OperatorApproval;
  network: Network;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IncreaseApprovalDialog: React.FC<IncreaseApprovalDialogProps> = ({
  approval,
  network,
  open,
  onOpenChange,
}) => {
  const [lockupIncrease, setLockupIncrease] = useState("");
  const [rateIncrease, setRateIncrease] = useState("");
  const [maxLockupPeriodIncrease, setMaxLockupPeriodIncrease] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { address: userAddress } = useConnection();

  const chain = getChain(network);

  const { execute, isExecuting } = useContractTransaction({
    account: userAddress,
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  // Check if current allowances are already unlimited
  const isCurrentLockupUnlimited = isUnlimitedValue(approval.lockupAllowance);
  const isCurrentRateUnlimited = isUnlimitedValue(approval.rateAllowance);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setLockupIncrease("");
      setRateIncrease("");
      setMaxLockupPeriodIncrease("");
      setIsUnlimited(false);
    }
  }, [open]);

  const decimals = Number(approval.token.decimals);
  const newTotals = computeIncreasedApproval(
    { lockup: lockupIncrease, rate: rateIncrease, maxLockupPeriod: maxLockupPeriodIncrease, isUnlimited },
    {
      lockup: BigInt(approval.lockupAllowance),
      rate: BigInt(approval.rateAllowance),
      maxLockupPeriod: BigInt(approval.maxLockupPeriod),
    },
    decimals,
  );
  const hasIncrease = isUnlimited || !!lockupIncrease || !!rateIncrease;
  const isBusy = isSubmitting || isExecuting;

  // Prevent dialog from closing while waiting for wallet signature
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return;
    onOpenChange(nextOpen);
  };

  const handleIncrease = async () => {
    if (!newTotals || !hasIncrease) return;

    setIsSubmitting(true);

    try {
      await execute({
        functionName: "setOperatorApproval",
        args: [
          approval.token.id,
          approval.operator.address,
          true,
          newTotals.rate,
          newTotals.lockup,
          newTotals.maxLockupPeriod,
        ],
        metadata: {
          type: "increaseApproval",
          operator: approval.operator.address,
          token: approval.token.symbol,
        },
        onSubmitOnChain: () => onOpenChange(false),
      });
    } catch (error) {
      console.error("Increase approval failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !isBusy && !!newTotals && hasIncrease;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className='sm:max-w-500px' showCloseButton={!isSubmitting}>
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
                    <div className='flex justify-start'>
                      <Badge variant='secondary' icon={InfinityIcon}>
                        Unlimited
                      </Badge>
                    </div>
                  ) : (
                    formatToken(approval.lockupAllowance, approval.token.decimals, approval.token.symbol, 2)
                  )}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Rate:</span>
                <div className='font-medium'>
                  {isCurrentRateUnlimited ? (
                    <div className='flex justify-start'>
                      <Badge variant='secondary' icon={InfinityIcon}>
                        Unlimited
                      </Badge>
                    </div>
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
                  onChange={setLockupIncrease}
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
                  onChange={setRateIncrease}
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
                  onChange={setMaxLockupPeriodIncrease}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
            </div>
          </div>
        </div>

        {!newTotals && (
          <p role='alert' className='text-sm text-destructive'>
            Enter plain decimal amounts and a whole number of epochs for the lockup period.
          </p>
        )}

        <DialogFooter>
          <Button
            variant='ghost'
            onClick={() => handleDialogOpenChange(false)}
            disabled={isSubmitting}
            className='py-2'
          >
            Cancel
          </Button>
          <Button variant='primary' onClick={handleIncrease} disabled={!canSubmit} className='py-2'>
            {isBusy ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </span>
            ) : (
              "Increase"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
