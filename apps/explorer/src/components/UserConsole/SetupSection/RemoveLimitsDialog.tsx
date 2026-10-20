"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { Hex } from "viem";
import { getChain } from "@/constants/chains";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { Network } from "@/types";
import { resolveOperator } from "@/utils/depositParam";
import { type OperatorApprovalTerms, unlimitedApprovalTerms } from "./data/setupStatus";

interface RemoveLimitsDialogProps {
  network: Network;
  account: Hex;
  current: OperatorApprovalTerms;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirms lifting the owner's Warm Storage limits, the one change the setup
 * page makes to an approval that already exists, and only for a link that asks
 * for unlimited. The owner's other approvals and their Filecoin Pay funds are untouched.
 */
export const RemoveLimitsDialog = ({ network, account, current, open, onOpenChange }: RemoveLimitsDialogProps) => {
  const chain = getChain(network);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { execute, isExecuting } = useContractTransaction({
    account,
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });
  const isBusy = isSubmitting || isExecuting;
  const operator = resolveOperator("fwss", network);

  const handleRemove = async () => {
    setIsSubmitting(true);
    try {
      await execute({
        functionName: "setOperatorApproval",
        args: [chain.contracts.usdfc.address, operator, ...unlimitedApprovalTerms(current)],
        metadata: { type: "increaseApproval", operator, token: "USDFC" },
        onSubmitOnChain: () => onOpenChange(false),
      });
    } catch (error) {
      // execute() already toasted; keep the full error for diagnostics.
      console.error("Removing Warm Storage limits failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing while the wallet has the request would abandon it.
        if (!next && isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md' showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Remove Warm Storage spending limits</DialogTitle>
          <DialogDescription>
            Warm Storage will be able to charge for storage without a cap on its rate or lockup. It still only charges
            for data sets you or your session keys create, and you can set limits again from the dashboard.
          </DialogDescription>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          The tool that sent this link needs this before it can upload. Set limits again later and it will ask for this
          step again.
        </p>
        <DialogFooter>
          <Button variant='ghost' size='compact' disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant='primary' size='compact' disabled={isBusy} onClick={handleRemove}>
            <span className='inline-flex items-center gap-2'>
              {isBusy && <Loader2 aria-hidden className='size-4 animate-spin' />}
              Remove limits
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
