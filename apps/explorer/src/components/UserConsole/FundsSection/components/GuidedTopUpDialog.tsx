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
  clearInvalidSquidAcquisition,
  clearSquidAcquisition,
  getSquidDepositAmount,
  hasSameSquidAcquisitionSnapshot,
  hasSavedSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidAcquiredFromBalance,
  markSquidDepositPending,
  resetSquidDeposit,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { isAutomaticSquidRecoveryCandidate } from "../data/squid-acquisition-recovery";
import { isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import { readUsdfcBalance } from "../data/usdfc-balance";
import { useSquidAcquisitionRecovery } from "../hooks/useSquidAcquisitionRecovery";
import { FundingRunwaySlider, RunwayCard } from "./RunwayCard";
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
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionOwner, setAcquisitionOwner] = useState<Address | null>(null);
  const [savedAcquisition, setSavedAcquisition] = useState<SquidAcquisition | null>(null);
  const [hasInvalidAcquisition, setHasInvalidAcquisition] = useState(false);
  const [automaticRecoveryError, setAutomaticRecoveryError] = useState<string | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const originalChainId = useRef<number | undefined>(undefined);
  const wasOpen = useRef(false);
  // Set when the amount was prefilled for this open, so clearing the field
  // doesn't refill it (see the prefill effect below).
  const didPrefillAmount = useRef(false);
  const latestAddress = useRef(address);
  latestAddress.current = address;
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
  const automaticRecovery = useSquidAcquisitionRecovery(savedAcquisition, address);
  useEffect(() => {
    setIsSubmitting(false);
    if (!address) {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setHasInvalidAcquisition(false);
      setAutomaticRecoveryError(null);
      setAcquisitionState("idle");
      return;
    }

    try {
      let hasSavedAcquisition = hasSavedSquidAcquisition(window.localStorage, address);
      let saved = loadSquidAcquisition(window.localStorage, address);
      if (open && saved?.status === "processing" && saved.executionStage === "preparing") {
        clearSquidAcquisition(window.localStorage, saved);
        hasSavedAcquisition = false;
        saved = null;
      }
      const hasInvalidSavedAcquisition = hasSavedAcquisition && saved === null;
      setSavedAcquisition(saved);
      setHasInvalidAcquisition(hasInvalidSavedAcquisition);
      setAutomaticRecoveryError(null);
      setAcquisitionOwner(saved?.owner ?? null);
      setAcquiredAmount(saved?.status === "acquired" ? getSquidDepositAmount(saved) : null);
      setAcquisitionState(
        saved?.status === "acquired" ? "acquired" : saved || hasInvalidSavedAcquisition ? "blocked" : "idle",
      );
    } catch {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setHasInvalidAcquisition(false);
      setAutomaticRecoveryError(null);
      setAcquisitionState("blocked");
    }
  }, [address, open]);

  useEffect(() => {
    const pending = savedAcquisition;
    const deliveredAmount = automaticRecovery.data;
    if (
      !isAutomaticSquidRecoveryCandidate(pending) ||
      deliveredAmount === undefined ||
      deliveredAmount === null ||
      automaticRecovery.dataUpdatedAt === 0
    ) {
      return;
    }
    let cancelled = false;
    setAutomaticRecoveryError(null);
    void withSquidAcquisitionLock(globalThis.navigator?.locks, pending.owner, () =>
      markSquidAcquired(window.localStorage, pending, deliveredAmount),
    )
      .then((acquired) => {
        if (cancelled || latestAddress.current?.toLowerCase() !== acquired.owner.toLowerCase()) return;
        setSavedAcquisition(acquired);
        setAcquisitionOwner(acquired.owner);
        setAcquiredAmount(getSquidDepositAmount(acquired));
        setAcquisitionState("acquired");
      })
      .catch((error) => {
        if (cancelled || latestAddress.current?.toLowerCase() !== pending.owner.toLowerCase()) return;
        try {
          const latest = loadSquidAcquisition(window.localStorage, pending.owner);
          if (latest && !hasSameSquidAcquisitionSnapshot(latest, pending)) {
            setSavedAcquisition(latest);
            setAcquisitionOwner(latest.owner);
            setAcquiredAmount(latest.status === "acquired" ? getSquidDepositAmount(latest) : null);
            setAcquisitionState(latest.status === "acquired" ? "acquired" : "blocked");
            setAutomaticRecoveryError(null);
            return;
          }
        } catch {
          // Surface the original transition error below. The next poll retries
          // both the storage read and the exact-snapshot transition.
        }
        setAutomaticRecoveryError(error instanceof Error ? error.message : "Automatic recovery could not continue");
      });
    return () => {
      cancelled = true;
    };
  }, [automaticRecovery.data, automaticRecovery.dataUpdatedAt, savedAcquisition]);

  useEffect(() => {
    // Reset the amount on open; the prefill effect below fills it once the
    // on-chain summary is available.
    if (open && !wasOpen.current) {
      originalChainId.current = chainId;
      if (acquiredAmount === null) {
        setAmount("");
        didPrefillAmount.current = false;
      }
    }
    wasOpen.current = open;
  }, [acquiredAmount, chainId, open]);

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

    try {
      await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, async () => {
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
          await invalidateTopUpQueries(queryClient, accountId, depositOwner);
          try {
            clearSquidAcquisition(window.localStorage, pendingAcquisition);
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
            setHasInvalidAcquisition(false);
            setAcquisitionState("idle");
            closeDialog();
          }
        } catch (error) {
          if (!didBroadcast && isUserRejectedRequest(error)) {
            try {
              const acquired = resetSquidDeposit(window.localStorage, pendingAcquisition);
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
              description: walletErrorMessage(error, "Your wallet did not complete the request."),
            });
          }
        } finally {
          if (isCurrentDepositOwner()) setIsSubmitting(false);
        }
      });
    } catch (error) {
      toast.error("The deposit cannot start safely.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const clearBlockedAcquisition = async () => {
    if (!address) return;
    const clearMessage =
      savedAcquisition?.status === "depositing"
        ? "Only clear this after confirming the Filecoin deposit completed."
        : "Only clear this after confirming USDFC did not arrive and no source transaction is pending.";
    if (!window.confirm(clearMessage)) {
      return;
    }
    try {
      if (!savedAcquisition) return;
      await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, () =>
        clearSquidAcquisition(window.localStorage, savedAcquisition),
      );
    } catch {
      toast.error("Browser storage is unavailable. The saved acquisition could not be cleared.");
      return;
    }
    setAcquiredAmount(null);
    setAcquisitionOwner(null);
    const completedDeposit = savedAcquisition?.status === "depositing";
    setSavedAcquisition(null);
    setHasInvalidAcquisition(false);
    setAutomaticRecoveryError(null);
    setAcquisitionState("idle");
    if (completedDeposit) closeDialog();
  };

  const clearInvalidAcquisition = async () => {
    if (!address || !window.confirm("Clear the invalid saved acquisition data from this browser?")) return;
    try {
      await withSquidAcquisitionLock(globalThis.navigator?.locks, address, () =>
        clearInvalidSquidAcquisition(window.localStorage, address),
      );
      setHasInvalidAcquisition(false);
      setAutomaticRecoveryError(null);
      setAcquisitionState("idle");
    } catch (error) {
      toast.error("The invalid saved acquisition could not be cleared.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const continueWithAcquiredUsdfc = async () => {
    if (savedAcquisition?.status !== "processing") return;
    try {
      await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, async () => {
        if (savedAcquisition.destinationBalanceBefore !== undefined) {
          if (!destinationClient) throw new Error("Filecoin balance client is unavailable");
          const currentBalance = await readUsdfcBalance(
            destinationClient,
            mainnet.contracts.usdfc.address,
            savedAcquisition.owner,
          );
          const acquired = markSquidAcquiredFromBalance(window.localStorage, savedAcquisition, currentBalance);
          setSavedAcquisition(acquired);
          setAcquisitionOwner(acquired.owner);
          setAcquiredAmount(getSquidDepositAmount(acquired));
          setAcquisitionState("acquired");
          return;
        }
        const acquired = markSquidAcquired(window.localStorage, savedAcquisition);
        setSavedAcquisition(acquired);
        setAcquisitionOwner(acquired.owner);
        setAcquiredAmount(getSquidDepositAmount(acquired));
        setAcquisitionState("acquired");
      });
    } catch (error) {
      toast.error("The acquisition could not be recovered safely.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const retryFilecoinDeposit = async () => {
    if (savedAcquisition?.status !== "depositing") return;
    if (!window.confirm("Retry only after confirming the saved Filecoin transaction did not complete.")) return;
    try {
      const acquired = await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, () =>
        resetSquidDeposit(window.localStorage, savedAcquisition),
      );
      setSavedAcquisition(acquired);
      setAcquisitionOwner(acquired.owner);
      setAcquiredAmount(getSquidDepositAmount(acquired));
      setAcquisitionState("acquired");
    } catch {
      toast.error("Browser storage is unavailable. The deposit could not be recovered safely.");
    }
  };

  const switchToFilecoin = async () => {
    setIsSwitchingNetwork(true);
    try {
      await switchChainAsync({ chainId: mainnet.id });
    } catch (error) {
      toast.error("Could not switch to Filecoin", {
        description: error instanceof Error ? error.message : "Your wallet did not switch networks.",
      });
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const closeDialog = () => {
    const chainIdToRestore = originalChainId.current;
    originalChainId.current = undefined;
    onOpenChange(false);
    if (chainIdToRestore === undefined || chainIdToRestore === chainId) return;
    void switchChainAsync({ chainId: chainIdToRestore }).catch((error) => {
      toast.error("Could not restore your wallet network", {
        description: walletErrorMessage(error, "Your wallet did not switch back to its original network."),
      });
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && acquisitionState === "processing") {
      toast.info("Wait for the acquisition request to finish before closing this dialog.");
      return;
    }
    if (!nextOpen && isSwitchingNetwork) {
      toast.info("Wait for the wallet network switch to finish before closing this dialog.");
      return;
    }
    if (nextOpen) onOpenChange(true);
    else closeDialog();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[500px]'>
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
            {acquiredAmount !== null && (
              <p className='text-sm font-medium'>Ready to deposit: {formatUsdfcAmount(acquiredAmount)} USDFC.</p>
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
          {current && (
            <RunwayCard current={current} projected={projected}>
              <p className='text-muted-foreground'>
                {acquiredAmount === null ? "Target deposit" : "Ready to deposit"}:{" "}
                {depositAmount === null ? "—" : formatUsdfcAmount(depositAmount)} USDFC.
              </p>
            </RunwayCard>
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
                      <p>Check {savedSourceChain?.name ?? `chain ${savedAcquisition.sourceChainId}`} for the swap.</p>
                      {savedAcquisition.transactionHashes.map((hash) => (
                        <code className='block break-all' key={hash}>
                          {hash}
                        </code>
                      ))}
                      {savedAcquisition.transactionHashes.length === 0 && (
                        <p>The wallet request may have been submitted without returning a transaction hash.</p>
                      )}
                      {automaticRecovery.isEligible && !automaticRecovery.error && !automaticRecoveryError && (
                        <p className='inline-flex items-center gap-2 text-muted-foreground' role='status'>
                          {automaticRecovery.isFetching && <Loader2 className='h-4 w-4 animate-spin' />}
                          Automatically checking the source transaction and Filecoin USDFC balance…
                        </p>
                      )}
                      {automaticRecovery.isEligible && (automaticRecovery.error || automaticRecoveryError) && (
                        <div className='grid gap-2' role='alert'>
                          <p className='text-destructive'>
                            Automatic recovery {automaticRecovery.isPermanentError ? "stopped" : "will retry"}:{" "}
                            {automaticRecoveryError || automaticRecovery.error?.message}
                          </p>
                          {!automaticRecovery.isPermanentError && (
                            <Button
                              onClick={() => {
                                setAutomaticRecoveryError(null);
                                void automaticRecovery.refetch();
                              }}
                              size='compact'
                              type='button'
                              variant='tertiary'
                            >
                              Retry automatic check now
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div className='flex flex-wrap gap-2'>
                    {savedAcquisition.status === "processing" && !automaticRecovery.isEligible && (
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
                <>
                  <p className='text-destructive'>
                    {hasInvalidAcquisition
                      ? "The saved acquisition data is invalid and must be cleared before funding can continue."
                      : "Browser storage is unavailable, so funding cannot continue safely."}
                  </p>
                  {hasInvalidAcquisition && (
                    <Button onClick={clearInvalidAcquisition} size='compact' type='button' variant='tertiary'>
                      Clear invalid saved acquisition
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {acquiredAmount === null && acquisitionState !== "blocked" && (
            <SquidQuoteReview
              acquisitionState={acquisitionState}
              destinationAmount={depositAmount}
              onAcquired={(acquired) => {
                setSavedAcquisition(acquired);
                setAcquiredAmount(getSquidDepositAmount(acquired));
                setAcquisitionOwner(acquired.owner);
              }}
              onAcquisitionStateChange={setAcquisitionState}
              onBlocked={setSavedAcquisition}
              onNetworkSwitchingChange={setIsSwitchingNetwork}
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
            disabled={isSubmitting || acquisitionState === "processing" || isSwitchingNetwork}
            onClick={() => handleOpenChange(false)}
            variant='ghost'
          >
            Cancel
          </Button>
          {acquisitionState === "processing" ? (
            <Button disabled variant='primary'>
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Acquiring USDFC…
              </span>
            </Button>
          ) : acquisitionState === "blocked" ? (
            <Button disabled variant='primary'>
              Check the saved acquisition above to continue
            </Button>
          ) : acquiredAmount !== null && chainId !== mainnet.id ? (
            <Button disabled={isSubmitting || isSwitchingNetwork} onClick={switchToFilecoin} variant='primary'>
              {isSwitchingNetwork ? (
                <span className='inline-flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Switching to Filecoin…
                </span>
              ) : (
                "Switch to Filecoin to deposit"
              )}
            </Button>
          ) : acquiredAmount !== null ? (
            <Button
              disabled={!synapse || isSubmitting || isSwitchingNetwork || !acquisitionOwnerMatches}
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
