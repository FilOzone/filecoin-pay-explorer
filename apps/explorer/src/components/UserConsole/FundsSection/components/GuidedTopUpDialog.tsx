"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import {
  calculateFundingRunway,
  type FundingPosition,
  formatSuggestedTopUp,
  formatUsdfcAmount,
} from "../data/funding-runway";
import { parseTopUpAmount } from "../data/guided-top-up";
import { RunwayCard, SUGGESTED_CHIP_CAPTION } from "./RunwayCard";
import { SquidQuoteReview } from "./SquidQuoteReview";

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = ["Acquire USDFC", "Deposit to Filecoin Pay"] as const;
  return (
    <ol className='flex items-center gap-2 text-sm'>
      {steps.map((label, index) => {
        const position = index + 1;
        const isDone = step > position;
        const isActive = step === position;
        return (
          <li className='flex items-center gap-2' key={label}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <Check className='h-3.5 w-3.5' /> : position}
            </span>
            <span className={isActive ? "font-medium" : "text-muted-foreground"}>{label}</span>
            {position < steps.length && <span className='mx-1 hidden h-px w-6 bg-border sm:block' />}
          </li>
        );
      })}
    </ol>
  );
}

type GuidedTopUpDialogProps = {
  accountId: string;
  amount: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  position: FundingPosition;
};

export function GuidedTopUpDialog({
  accountId,
  amount: initialAmount,
  onOpenChange,
  open,
  position,
}: GuidedTopUpDialogProps) {
  const { synapse } = useSynapse();
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const nowTimestamp = BigInt(Math.floor(Date.now() / 1_000));
  const suggestedTopUp = calculateFundingRunway(position, nowTimestamp).suggestedTopUp;
  const suggestedAmount = formatSuggestedTopUp(suggestedTopUp);
  const chipAmount = initialAmount || suggestedAmount;
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
  const wasOpen = useRef(false);
  const parsedAmount = parseTopUpAmount(amount);
  const depositAmount = acquiredAmount ?? parsedAmount;
  const step: 1 | 2 = acquiredAmount === null ? 1 : 2;

  useEffect(() => {
    // Reset to an empty amount on open; the user fills it (or taps the suggested chip) so nothing is pre-entered.
    if (open && !wasOpen.current && acquiredAmount === null) {
      setAmount("");
    }
    wasOpen.current = open;
  }, [acquiredAmount, open]);

  const handleConfirm = async () => {
    if (!synapse || acquiredAmount === null || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { receipt } = await synapse.payments.fundSync({
        amount: acquiredAmount,
        onHash: () => toast.info("Top-up transaction submitted"),
      });
      if (receipt.status !== "success") throw new Error("Top-up transaction reverted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
        queryClient.invalidateQueries({ queryKey: ["balance"] }),
        queryClient.invalidateQueries({ queryKey: ["readContract"] }),
      ]);
      toast.success("USDFC top-up confirmed");
      setAcquiredAmount(null);
      setAcquisitionState("idle");
      onOpenChange(false);
    } catch (error) {
      toast.error("USDFC top-up failed", {
        description: error instanceof Error ? error.message : "Your wallet did not complete the request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchToFilecoin = async () => {
    try {
      await switchChainAsync({ chainId: mainnet.id });
    } catch (error) {
      toast.error("Could not switch to Filecoin", {
        description: error instanceof Error ? error.message : "Your wallet did not switch networks.",
      });
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && acquisitionState === "processing") {
      toast.info("Wait for the acquisition request to finish before closing this dialog.");
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Fund with another token</DialogTitle>
          <DialogDescription>
            Acquire Filecoin USDFC through Squid, then deposit it into Filecoin Pay.
          </DialogDescription>
        </DialogHeader>
        <StepIndicator step={step} />
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='guided-top-up-amount'>USDFC to receive and deposit</Label>
            <Input
              disabled={acquiredAmount !== null || acquisitionState !== "idle"}
              id='guided-top-up-amount'
              min='0'
              onChange={setAmount}
              step='any'
              type='number'
              value={amount}
            />
            {amount !== "" && parsedAmount === null && acquiredAmount === null && (
              <p className='text-sm text-destructive'>Enter an amount greater than zero.</p>
            )}
            {chipAmount && acquiredAmount === null && (
              <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                <Button
                  className='w-fit'
                  disabled={acquisitionState !== "idle"}
                  onClick={() => setAmount(chipAmount)}
                  size='compact'
                  type='button'
                  variant='primary'
                >
                  Use suggested: {chipAmount} USDFC
                </Button>
                <span>{SUGGESTED_CHIP_CAPTION}</span>
              </div>
            )}
          </div>
          <RunwayCard depositAmount={depositAmount} nowTimestamp={nowTimestamp} position={position}>
            <p className='text-muted-foreground'>
              {acquiredAmount === null ? "Target deposit" : "Ready to deposit"}:{" "}
              {depositAmount === null ? "—" : formatUsdfcAmount(depositAmount)} USDFC.
            </p>
          </RunwayCard>
          <SquidQuoteReview
            acquisitionState={acquisitionState}
            destinationAmount={depositAmount}
            onAcquired={setAcquiredAmount}
            onAcquisitionStateChange={setAcquisitionState}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting || acquisitionState === "processing"}
            onClick={() => handleOpenChange(false)}
            variant='ghost'
          >
            Cancel
          </Button>
          {acquisitionState === "processing" ? (
            <Button disabled variant='primary'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Acquiring USDFC…
            </Button>
          ) : acquisitionState === "blocked" ? (
            <Button disabled variant='primary'>
              Verify acquisition below to continue
            </Button>
          ) : acquiredAmount !== null && chainId !== mainnet.id ? (
            <Button disabled={isSubmitting} onClick={switchToFilecoin} variant='primary'>
              Switch to Filecoin to deposit
            </Button>
          ) : acquiredAmount !== null ? (
            <Button disabled={!synapse || isSubmitting} onClick={handleConfirm} variant='primary'>
              {isSubmitting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Depositing…
                </>
              ) : (
                "Deposit acquired USDFC"
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
