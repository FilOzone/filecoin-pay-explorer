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
import type { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import {
  calculateFundingRunway,
  calculateProjectedFundingRunway,
  FUNDING_ESTIMATE_DISCLAIMER,
  FUNDING_TARGETS,
  type FundingAccountSummary,
  type FundingTarget,
  formatFundedThrough,
  formatSuggestedTopUp,
  formatUsdfcAmount,
} from "../data/funding-runway";
import { parseTopUpAmount } from "../data/guided-top-up";
import {
  clearSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidDepositPending,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { isUserRejectedRequest } from "../data/squid-execution";
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
  accountSummary?: FundingAccountSummary;
  isAccountSummaryLoading: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function GuidedTopUpDialog({
  accountId,
  accountSummary,
  isAccountSummaryLoading,
  onOpenChange,
  open,
}: GuidedTopUpDialogProps) {
  const { constants, synapse } = useSynapse();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [fundingTarget, setFundingTarget] = useState<FundingTarget>("year");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionOwner, setAcquisitionOwner] = useState<Address | null>(null);
  const [savedAcquisition, setSavedAcquisition] = useState<SquidAcquisition | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
  const wasOpen = useRef(false);
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const target = FUNDING_TARGETS[fundingTarget];
  const current = accountSummary
    ? calculateFundingRunway(accountSummary, target.epochs, constants.chain.genesisTimestamp)
    : null;
  const suggestedAmount = current ? formatSuggestedTopUp(current.suggestedTopUp) : "";
  const parsedAmount = parseTopUpAmount(amount);
  const depositAmount = acquiredAmount ?? parsedAmount;
  const projected =
    accountSummary && depositAmount !== null
      ? calculateProjectedFundingRunway(accountSummary, depositAmount, target.epochs, constants.chain.genesisTimestamp)
      : null;
  const step: 1 | 2 = acquiredAmount === null ? 1 : 2;
  const acquisitionOwnerMatches =
    acquisitionOwner === null || (address !== undefined && acquisitionOwner.toLowerCase() === address.toLowerCase());
  const savedSourceChain = SQUID_SOURCE_CHAINS.find(
    (sourceChain) => sourceChain.id === savedAcquisition?.sourceChainId,
  );

  useEffect(() => {
    setIsSubmitting(false);
    if (!address) {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setAcquisitionState("idle");
      return;
    }

    try {
      const saved = loadSquidAcquisition(window.localStorage, address);
      setSavedAcquisition(saved);
      setAcquisitionOwner(saved?.owner ?? null);
      setAcquiredAmount(saved?.status === "acquired" ? saved.destinationAmount : null);
      setAcquisitionState(saved?.status === "acquired" ? "acquired" : saved ? "blocked" : "idle");
    } catch {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setAcquisitionState("blocked");
    }
  }, [address]);

  useEffect(() => {
    // Reset to an empty amount on open; the user fills it (or taps the suggested chip) so nothing is pre-entered.
    if (open && !wasOpen.current && acquiredAmount === null) {
      setAmount("");
      setFundingTarget("year");
    }
    wasOpen.current = open;
  }, [acquiredAmount, open]);

  const handleConfirm = async () => {
    if (
      !synapse ||
      acquiredAmount === null ||
      isSubmitting ||
      !acquisitionOwner ||
      !acquisitionOwnerMatches ||
      !savedAcquisition
    )
      return;

    let pendingAcquisition: SquidAcquisition;
    try {
      pendingAcquisition = markSquidDepositPending(window.localStorage, savedAcquisition);
      setSavedAcquisition(pendingAcquisition);
    } catch {
      toast.error("Browser storage is unavailable. The deposit cannot start safely without recovery state.");
      return;
    }
    const depositOwner = acquisitionOwner;
    const isCurrentDepositOwner = () => latestAddress.current?.toLowerCase() === depositOwner.toLowerCase();
    let didBroadcast = false;
    setIsSubmitting(true);
    try {
      const { receipt } = await synapse.payments.fundSync({
        amount: acquiredAmount,
        onHash: (hash) => {
          didBroadcast = true;
          try {
            pendingAcquisition = markSquidDepositPending(window.localStorage, pendingAcquisition, hash);
            if (isCurrentDepositOwner()) setSavedAcquisition(pendingAcquisition);
          } catch {
            if (isCurrentDepositOwner()) {
              toast.error("The transaction was submitted, but its recovery state could not be updated.");
            }
          }
          if (isCurrentDepositOwner()) toast.info("Top-up transaction submitted");
        },
      });
      if (receipt.status !== "success") throw new Error("Top-up transaction reverted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
        queryClient.invalidateQueries({ queryKey: ["payments", "account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["balance"] }),
        queryClient.invalidateQueries({ queryKey: ["readContract"] }),
      ]);
      try {
        clearSquidAcquisition(window.localStorage, depositOwner);
      } catch {
        if (isCurrentDepositOwner()) {
          toast.warning("Top-up succeeded, but the saved acquisition could not be cleared.");
        }
      }
      if (isCurrentDepositOwner()) {
        toast.success("USDFC top-up confirmed");
        setAcquiredAmount(null);
        setAcquisitionOwner(null);
        setSavedAcquisition(null);
        setAcquisitionState("idle");
        onOpenChange(false);
      }
    } catch (error) {
      if (!didBroadcast && isUserRejectedRequest(error)) {
        try {
          const acquired = markSquidAcquired(window.localStorage, pendingAcquisition);
          if (isCurrentDepositOwner()) {
            setSavedAcquisition(acquired);
            setAcquisitionState("acquired");
          }
        } catch {
          if (isCurrentDepositOwner()) {
            setAcquiredAmount(null);
            setAcquisitionState("blocked");
          }
        }
      } else if (isCurrentDepositOwner()) {
        setAcquiredAmount(null);
        setAcquisitionState("blocked");
      }
      if (isCurrentDepositOwner()) {
        toast.error("USDFC top-up failed", {
          description: error instanceof Error ? error.message : "Your wallet did not complete the request.",
        });
      }
    } finally {
      if (isCurrentDepositOwner()) setIsSubmitting(false);
    }
  };

  const clearBlockedAcquisition = () => {
    if (!address) return;
    const clearMessage =
      savedAcquisition?.status === "depositing"
        ? "Only clear this after confirming the Filecoin deposit completed."
        : "Only clear this after confirming USDFC did not arrive and no source transaction is pending.";
    if (!window.confirm(clearMessage)) {
      return;
    }
    try {
      clearSquidAcquisition(window.localStorage, address);
    } catch {
      toast.error("Browser storage is unavailable. The saved acquisition could not be cleared.");
      return;
    }
    setAcquiredAmount(null);
    setAcquisitionOwner(null);
    const completedDeposit = savedAcquisition?.status === "depositing";
    setSavedAcquisition(null);
    setAcquisitionState("idle");
    if (completedDeposit) onOpenChange(false);
  };

  const continueWithAcquiredUsdfc = () => {
    if (savedAcquisition?.status !== "processing") return;
    try {
      const acquired = markSquidAcquired(window.localStorage, savedAcquisition);
      setSavedAcquisition(acquired);
      setAcquisitionOwner(acquired.owner);
      setAcquiredAmount(acquired.destinationAmount);
      setAcquisitionState("acquired");
    } catch {
      toast.error("Browser storage is unavailable. The acquisition could not be recovered safely.");
    }
  };

  const retryFilecoinDeposit = () => {
    if (savedAcquisition?.status !== "depositing") return;
    if (!window.confirm("Retry only after confirming the saved Filecoin transaction did not complete.")) return;
    try {
      const acquired = markSquidAcquired(window.localStorage, savedAcquisition);
      setSavedAcquisition(acquired);
      setAcquisitionOwner(acquired.owner);
      setAcquiredAmount(acquired.destinationAmount);
      setAcquisitionState("acquired");
    } catch {
      toast.error("Browser storage is unavailable. The deposit could not be recovered safely.");
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
            {accountSummary && acquiredAmount === null && (
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium'>Suggested runway</span>
                {(Object.keys(FUNDING_TARGETS) as FundingTarget[]).map((option) => (
                  <Button
                    aria-pressed={fundingTarget === option}
                    disabled={acquisitionState !== "idle"}
                    key={option}
                    onClick={() => setFundingTarget(option)}
                    size='compact'
                    type='button'
                    variant={fundingTarget === option ? "primary" : "tertiary"}
                  >
                    {FUNDING_TARGETS[option].label}
                  </Button>
                ))}
              </div>
            )}
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
            {suggestedAmount && acquiredAmount === null && (
              <Button
                className='w-fit'
                disabled={acquisitionState !== "idle"}
                onClick={() => setAmount(suggestedAmount)}
                size='compact'
                type='button'
                variant='primary'
              >
                Use suggested: {suggestedAmount} USDFC
              </Button>
            )}
            {suggestedAmount && acquiredAmount === null && (
              <p className='text-xs text-muted-foreground'>
                Keeps this account funded for about {target.label} at your current recurring spend rate.
              </p>
            )}
            {!accountSummary && acquiredAmount === null && (
              <p className='text-xs text-muted-foreground'>
                {isAccountSummaryLoading
                  ? "Loading on-chain funding status…"
                  : "On-chain funding status is unavailable. Enter an amount manually."}
              </p>
            )}
          </div>
          {current && (
            <div className='grid gap-2 rounded-md border p-3 text-sm'>
              <p>
                Current funded through: <span className='font-medium'>{formatFundedThrough(current)}</span>
              </p>
              <p>
                Projected funded through:{" "}
                <span className='font-medium'>{projected ? formatFundedThrough(projected, true) : "—"}</span>
              </p>
              <p className='text-muted-foreground'>
                {acquiredAmount === null ? "Target deposit" : "Ready to deposit"}:{" "}
                {depositAmount === null ? "—" : formatUsdfcAmount(depositAmount)} USDFC.
              </p>
              <p className='text-muted-foreground'>{FUNDING_ESTIMATE_DISCLAIMER}</p>
            </div>
          )}
          {acquisitionState === "blocked" && (
            <div className='grid gap-2 rounded-md border border-destructive/30 p-3 text-sm'>
              {savedAcquisition ? (
                <>
                  <p className='font-medium text-destructive'>A saved transaction needs verification.</p>
                  {savedAcquisition.status === "depositing" ? (
                    <p>
                      Check the Filecoin deposit transaction before retrying or clearing it:
                      {savedAcquisition.depositTransactionHash ? (
                        <code className='mt-1 block break-all'>{savedAcquisition.depositTransactionHash}</code>
                      ) : (
                        <span className='mt-1 block'>The wallet request may not have returned a transaction hash.</span>
                      )}
                    </p>
                  ) : (
                    <>
                      <p>Check {savedSourceChain?.name ?? `chain ${savedAcquisition.sourceChainId}`} for USDFC.</p>
                      {savedAcquisition.transactionHashes.map((hash) => (
                        <code className='block break-all' key={hash}>
                          {hash}
                        </code>
                      ))}
                      {savedAcquisition.transactionHashes.length === 0 && (
                        <p>The wallet request may have been submitted without returning a transaction hash.</p>
                      )}
                    </>
                  )}
                  <div className='flex flex-wrap gap-2'>
                    {savedAcquisition.status === "processing" && (
                      <Button onClick={continueWithAcquiredUsdfc} size='compact' type='button' variant='tertiary'>
                        USDFC arrived, continue to deposit
                      </Button>
                    )}
                    {savedAcquisition.status === "depositing" && (
                      <Button onClick={retryFilecoinDeposit} size='compact' type='button' variant='tertiary'>
                        Deposit failed, retry
                      </Button>
                    )}
                    <Button onClick={clearBlockedAcquisition} size='compact' type='button' variant='tertiary'>
                      {savedAcquisition.status === "depositing"
                        ? "Deposit completed, clear"
                        : "USDFC did not arrive, clear"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className='text-destructive'>Browser storage is unavailable, so funding cannot continue safely.</p>
              )}
            </div>
          )}
          {acquiredAmount === null && acquisitionState !== "blocked" && (
            <SquidQuoteReview
              acquisitionState={acquisitionState}
              destinationAmount={depositAmount}
              onAcquired={(acquired) => {
                setSavedAcquisition(acquired);
                setAcquiredAmount(acquired.destinationAmount);
                setAcquisitionOwner(acquired.owner);
              }}
              onAcquisitionStateChange={setAcquisitionState}
              onBlocked={setSavedAcquisition}
            />
          )}
          {acquiredAmount !== null && !acquisitionOwnerMatches && (
            <p className='text-sm text-destructive' role='alert'>
              Switch back to {acquisitionOwner} before depositing the acquired USDFC.
            </p>
          )}
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
              Check the saved acquisition above to continue
            </Button>
          ) : acquiredAmount !== null && chainId !== mainnet.id ? (
            <Button disabled={isSubmitting} onClick={switchToFilecoin} variant='primary'>
              Switch to Filecoin to deposit
            </Button>
          ) : acquiredAmount !== null ? (
            <Button
              disabled={!synapse || isSubmitting || !acquisitionOwnerMatches}
              onClick={handleConfirm}
              variant='primary'
            >
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
