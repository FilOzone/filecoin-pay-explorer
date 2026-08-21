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
import { type Address, erc20Abi } from "viem";
import { useConnection, usePublicClient, useSwitchChain } from "wagmi";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import {
  calculateFundingRunway,
  calculateProjectedFundingRunway,
  defaultTopUpSuggestion,
  type FundingAccountSummary,
  formatUsdfcAmount,
  ONE_YEAR_EPOCHS,
} from "../data/funding-runway";
import { invalidateTopUpQueries, parseTopUpAmount } from "../data/guided-top-up";
import {
  clearSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidDepositPending,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import { FundingRunwaySlider, RunwayCard } from "./RunwayCard";
import { SquidQuoteReview } from "./SquidQuoteReview";
import { TopUpProgress, type TopUpStage } from "./TopUpProgress";

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
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const filecoinClient = usePublicClient({ chainId: mainnet.id });
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionOwner, setAcquisitionOwner] = useState<Address | null>(null);
  const [savedAcquisition, setSavedAcquisition] = useState<SquidAcquisition | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
  const [progressStage, setProgressStage] = useState<TopUpStage | null>(null);
  const [stageFailed, setStageFailed] = useState(false);
  const [quotedReceive, setQuotedReceive] = useState<bigint | null>(null);
  const [stillBridging, setStillBridging] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const wasOpen = useRef(false);
  // Set when the amount was prefilled for this open, so clearing the field
  // doesn't refill it (see the prefill effect below).
  const didPrefillAmount = useRef(false);
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const latestChainId = useRef(chainId);
  latestChainId.current = chainId;
  const latestSynapse = useRef(synapse);
  latestSynapse.current = synapse;
  // One auto-deposit attempt per acquisition; a failure hands over to the
  // manual resume buttons instead of retry loops.
  const autoDepositAttempted = useRef(false);
  // The runway duration only affects the slider's suggestions (computed inside
  // FundingRunwaySlider); the displayed funded-through dates are duration-agnostic.
  const current = accountSummary
    ? calculateFundingRunway(accountSummary, ONE_YEAR_EPOCHS, constants.chain.genesisTimestamp)
    : null;
  const parsedAmount = parseTopUpAmount(amount);
  const depositAmount = acquiredAmount ?? parsedAmount;
  const projected =
    accountSummary && depositAmount !== null
      ? calculateProjectedFundingRunway(
          accountSummary,
          depositAmount,
          ONE_YEAR_EPOCHS,
          constants.chain.genesisTimestamp,
        )
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
      // Interrupted acquisitions with a balance snapshot resume automatic
      // verification ("processing"); only records the app cannot verify
      // on-chain (legacy, no snapshot) fall to the manual recovery card.
      setAcquisitionState(
        saved?.status === "acquired"
          ? "acquired"
          : saved?.status === "processing" &&
              saved.destinationBalanceBefore !== undefined &&
              saved.swapBroadcast === true
            ? "processing"
            : saved
              ? "blocked"
              : "idle",
      );
      setProgressStage(
        saved?.status === "processing" && saved.destinationBalanceBefore !== undefined && saved.swapBroadcast === true
          ? "bridging"
          : null,
      );
      setStageFailed(false);
      setStillBridging(false);
      autoDepositAttempted.current = false;
    } catch {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setAcquisitionState("blocked");
    }
  }, [address]);

  useEffect(() => {
    // Reset the amount on open; the prefill effect below fills it once the
    // on-chain summary is available.
    if (open && !wasOpen.current && acquiredAmount === null) {
      setAmount("");
      didPrefillAmount.current = false;
    }
    wasOpen.current = open;
  }, [acquiredAmount, open]);

  // Prefill the amount with the slider's default suggestion once per open, so
  // the projection is live immediately instead of dashes until the user acts.
  // The summary loads async, so this fires whenever it arrives while open.
  const defaultSuggestion = accountSummary
    ? defaultTopUpSuggestion(accountSummary, constants.chain.genesisTimestamp)
    : "";
  useEffect(() => {
    if (!open || !defaultSuggestion || didPrefillAmount.current || acquiredAmount !== null) return;
    didPrefillAmount.current = true;
    setAmount((previous) => (previous === "" ? defaultSuggestion : previous));
  }, [acquiredAmount, defaultSuggestion, open]);

  // Reopening resumes arrival verification after a "still bridging" timeout.
  useEffect(() => {
    if (open) setStillBridging(false);
  }, [open]);

  const runDeposit = async (acquired: SquidAcquisition) => {
    const depositSynapse = latestSynapse.current;
    if (!depositSynapse || isSubmitting || !acquisitionOwnerMatches) return;

    let pendingAcquisition: SquidAcquisition;
    try {
      pendingAcquisition = markSquidDepositPending(window.localStorage, acquired);
      setSavedAcquisition(pendingAcquisition);
    } catch {
      toast.error("Browser storage is unavailable. The deposit cannot start safely without recovery state.");
      return;
    }
    const depositOwner = acquired.owner;
    const isCurrentDepositOwner = () => latestAddress.current?.toLowerCase() === depositOwner.toLowerCase();
    let didBroadcast = false;
    setIsSubmitting(true);
    setProgressStage("depositing");
    try {
      const { receipt } = await depositSynapse.payments.fundSync({
        amount: acquired.destinationAmount,
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
      await invalidateTopUpQueries(queryClient, accountId, depositOwner);
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
        setProgressStage(null);
        setStageFailed(false);
        autoDepositAttempted.current = false;
        onOpenChange(false);
      }
    } catch (error) {
      if (!didBroadcast && isUserRejectedRequest(error)) {
        try {
          const reacquired = markSquidAcquired(window.localStorage, pendingAcquisition);
          if (isCurrentDepositOwner()) {
            setSavedAcquisition(reacquired);
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
        setStageFailed(true);
        toast.error("USDFC top-up failed", {
          description: walletErrorMessage(error, "Your wallet did not complete the request."),
        });
      }
    } finally {
      if (isCurrentDepositOwner()) setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (acquiredAmount === null || isSubmitting || !acquisitionOwnerMatches || !savedAcquisition) return;
    await runDeposit(savedAcquisition);
  };

  // Full-auto continuation: once arrival is confirmed, request the switch
  // back to Filecoin and start the deposit without further clicks. Exactly one
  // attempt per acquisition; failures hold the stage and hand over to the
  // manual buttons.
  const autoDeposit = async (acquired: SquidAcquisition) => {
    if (autoDepositAttempted.current) return;
    autoDepositAttempted.current = true;
    setStageFailed(false);
    setProgressStage("switching");
    try {
      if (latestChainId.current !== mainnet.id) await switchChainAsync({ chainId: mainnet.id });
      // synapse re-initializes after a network switch; wait for the
      // Filecoin-bound instance before depositing through it.
      for (let attempt = 0; ; attempt += 1) {
        const candidate = latestSynapse.current;
        if (candidate && candidate.chain.id === mainnet.id && latestChainId.current === mainnet.id) break;
        if (attempt >= 30) throw new Error("The Filecoin connection did not become ready after the switch.");
        const { promise: readyDelay, resolve: readyTick } = Promise.withResolvers<void>();
        setTimeout(readyTick, 500);
        await readyDelay;
      }
    } catch (error) {
      setStageFailed(true);
      toast.error("Could not switch to Filecoin", {
        description: walletErrorMessage(error, "Your wallet did not switch networks."),
      });
      return;
    }
    await runDeposit(acquired);
  };
  const autoDepositRef = useRef(autoDeposit);
  autoDepositRef.current = autoDeposit;

  // Resume verification for an interrupted acquisition: the swap may
  // still be bridging, so watch the on-chain balance instead of asking the
  // user. 5 minutes of 10s polls, then downgrade to "still bridging".
  useEffect(() => {
    const saved = savedAcquisition;
    if (!open || !address || !filecoinClient) return;
    if (saved?.status !== "processing" || saved.destinationBalanceBefore === undefined) return;
    // Without a recorded swap broadcast, no USDFC can be in flight — the
    // manual recovery card handles that state instead of a phantom bridge.
    if (saved.swapBroadcast !== true) return;
    if (!acquisitionOwnerMatches || stillBridging) return;
    const before = saved.destinationBalanceBefore;
    const usdfc = constants.contracts.usdfc;
    let cancelled = false;
    const verify = async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        try {
          const balance = await filecoinClient.readContract({
            abi: erc20Abi,
            address: usdfc,
            args: [saved.owner],
            functionName: "balanceOf",
          });
          if (cancelled) return;
          if (balance >= before + saved.destinationAmount) {
            const reacquired = markSquidAcquired(window.localStorage, saved);
            setSavedAcquisition(reacquired);
            setAcquisitionOwner(reacquired.owner);
            setAcquiredAmount(reacquired.destinationAmount);
            setAcquisitionState("acquired");
            return;
          }
        } catch {
          // Transient RPC failure spends the attempt; arrival is re-checked.
        }
        const { promise: pollDelay, resolve: pollTick } = Promise.withResolvers<void>();
        setTimeout(pollTick, 10_000);
        await pollDelay;
      }
      if (!cancelled) setStillBridging(true);
    };
    void verify();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    address,
    savedAcquisition,
    acquisitionOwnerMatches,
    stillBridging,
    filecoinClient,
    constants.contracts.usdfc,
  ]);

  // A verified (or recovered) acquisition continues to deposit automatically.
  useEffect(() => {
    if (!open || acquisitionState !== "acquired" || !savedAcquisition) return;
    if (!acquisitionOwnerMatches || isSubmitting || autoDepositAttempted.current) return;
    void autoDepositRef.current(savedAcquisition);
  }, [open, acquisitionState, savedAcquisition, acquisitionOwnerMatches, isSubmitting]);

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
    setProgressStage(null);
    setStageFailed(false);
    setStillBridging(false);
    autoDepositAttempted.current = false;
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
      autoDepositAttempted.current = false;
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
    // Closing mid-flight is safe: the acquisition record persists and
    // verification resumes automatically when the dialog reopens.
    if (!nextOpen && (acquisitionState === "processing" || isSubmitting)) {
      toast.info("Top-up continues in the background — reopen this dialog anytime to check progress.");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Fund with another token</DialogTitle>
          <DialogDescription>
            Acquire Filecoin USDFC through{" "}
            <a
              className='underline underline-offset-2'
              href='https://app.squidrouter.com/'
              rel='noopener noreferrer'
              target='_blank'
            >
              Squid
            </a>
            , then deposit it into Filecoin Pay.
          </DialogDescription>
        </DialogHeader>
        <StepIndicator step={step} />
        <div className='grid gap-4'>
          {/* Inputs only while composing; a running or finished acquisition
              collapses the dialog to progress + key figures. */}
          {acquisitionState === "idle" && acquiredAmount === null && (
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
              {acquiredAmount === null && (
                <p className='text-xs text-muted-foreground'>
                  {quotedReceive !== null
                    ? `~${formatUsdfcAmount(quotedReceive)} USDFC will be deposited once the swap succeeds.`
                    : "You'll receive at least this amount; the exact amount the swap delivers is what gets deposited."}
                </p>
              )}
              {accountSummary && acquiredAmount === null && (
                <FundingRunwaySlider
                  accountSummary={accountSummary}
                  amount={amount}
                  disabled={acquisitionState !== "idle"}
                  genesisTimestamp={constants.chain.genesisTimestamp}
                  onSelect={setAmount}
                />
              )}
              {!accountSummary && acquiredAmount === null && (
                <p className='text-xs text-muted-foreground'>
                  {isAccountSummaryLoading
                    ? "Loading on-chain funding status…"
                    : "On-chain funding status is unavailable. Enter an amount manually."}
                </p>
              )}
            </div>
          )}
          {current && (
            <RunwayCard current={current} projected={projected}>
              <p className='text-muted-foreground'>
                {acquiredAmount === null ? "Target deposit" : "Ready to deposit"}:{" "}
                {depositAmount === null ? "—" : formatUsdfcAmount(depositAmount)} USDFC.
              </p>
            </RunwayCard>
          )}
          {progressStage && (
            <div className='grid gap-2 rounded-md border p-3'>
              <TopUpProgress failed={stageFailed} stage={progressStage} />
              {quotedReceive !== null && acquiredAmount === null && (
                <p className='text-xs text-muted-foreground'>
                  ~{formatUsdfcAmount(quotedReceive)} USDFC will be deposited once the swap succeeds.
                </p>
              )}
              {savedAcquisition?.status === "processing" && !stillBridging && progressStage === "bridging" && (
                <p className='text-xs text-muted-foreground'>
                  Bridging to Filecoin — usually 1–5 minutes. Your USDFC balance is checked automatically every few
                  seconds, and it is safe to close this dialog.
                </p>
              )}
              {stillBridging && (
                <p className='text-xs text-muted-foreground'>
                  Still bridging — this can occasionally take longer. It is safe to close this dialog; checking resumes
                  automatically when you reopen it. Funds in a committed bridge cannot be cancelled.
                </p>
              )}
              {savedAcquisition?.status === "processing" && (
                <Button onClick={clearBlockedAcquisition} size='compact' type='button' variant='tertiary'>
                  Stop tracking this acquisition
                </Button>
              )}
            </div>
          )}
          {acquisitionState === "blocked" && (
            <div className='grid gap-2 rounded-md border border-destructive/30 p-3 text-sm'>
              {savedAcquisition ? (
                <>
                  <p className='font-medium text-destructive'>
                    An acquisition was interrupted before its outcome was confirmed.
                  </p>
                  {lastFailure && (
                    <p>
                      Reason: <span className='text-destructive'>{lastFailure}</span>
                    </p>
                  )}
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
                      <p>
                        The acquisition sent the transaction(s) below on{" "}
                        {savedSourceChain?.name ?? `chain ${savedAcquisition.sourceChainId}`} — these can be token
                        approvals or the swap itself, and the flow stopped before confirming the swap completed. If the
                        swap ran, the USDFC arrives in your wallet on Filecoin after a few minutes of bridging. Check
                        your Filecoin USDFC balance changed before continuing; if only approvals went through, no USDFC
                        is coming — clear and retry.
                      </p>
                      <p className='text-muted-foreground'>
                        Sent on {savedSourceChain?.name ?? `chain ${savedAcquisition.sourceChainId}`}:
                      </p>
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
                      <Button onClick={continueWithAcquiredUsdfc} size='compact' type='button' variant='primary'>
                        USDFC arrived, continue to deposit
                      </Button>
                    )}
                    {savedAcquisition.status === "depositing" && (
                      <Button onClick={retryFilecoinDeposit} size='compact' type='button' variant='primary'>
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
          {lastFailure && acquisitionState === "idle" && acquiredAmount === null && (
            <p className='text-sm text-destructive' role='alert'>
              Last attempt: {lastFailure}
            </p>
          )}
          {acquiredAmount === null &&
            acquisitionState !== "blocked" &&
            acquisitionState !== "processing" &&
            savedAcquisition?.status !== "processing" && (
              <SquidQuoteReview
                acquisitionState={acquisitionState}
                destinationAmount={depositAmount}
                onAcquired={(acquired) => {
                  setSavedAcquisition(acquired);
                  setAcquiredAmount(acquired.destinationAmount);
                  setAcquisitionOwner(acquired.owner);
                }}
                onAcquisitionStateChange={(state) => {
                  if (state === "processing") {
                    autoDepositAttempted.current = false;
                    setStageFailed(false);
                    setStillBridging(false);
                    setLastFailure(null);
                  }
                  if (state === "idle") setProgressStage(null);
                  setAcquisitionState(state);
                }}
                onBlocked={setSavedAcquisition}
                onFailure={setLastFailure}
                onProgress={(stage) => {
                  setStageFailed(false);
                  setProgressStage(stage);
                }}
                onQuoteChange={setQuotedReceive}
              />
            )}
          {acquiredAmount !== null && !acquisitionOwnerMatches && (
            <p className='text-sm text-destructive' role='alert'>
              Switch back to {acquisitionOwner} before depositing the acquired USDFC.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant='ghost'>
            {/* Nothing is cancelled by closing once a flow is running or acquired. */}
            {acquisitionState === "idle" && acquiredAmount === null ? "Cancel" : "Close"}
          </Button>
          {acquisitionState === "processing" ? (
            <Button disabled variant='primary'>
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {progressStage === "approving"
                  ? "Approving…"
                  : progressStage === "swapping"
                    ? "Confirm the swap in your wallet…"
                    : progressStage === "bridging"
                      ? "Bridging to Filecoin…"
                      : "Acquiring USDFC…"}
              </span>
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
                <span className='inline-flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Depositing…
                </span>
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
