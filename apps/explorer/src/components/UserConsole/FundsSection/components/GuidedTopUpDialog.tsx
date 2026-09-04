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
import { useConnection, usePublicClient, useSwitchChain } from "wagmi";
import { mainnet } from "@/constants/chains";
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
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { runSquidDeposit } from "../data/squid-deposit";
import { walletErrorMessage } from "../data/squid-execution";
import { useGuidedSquidAcquisition } from "../hooks/useGuidedSquidAcquisition";
import { useOriginalWalletChain } from "../hooks/useOriginalWalletChain";
import { FundingRunwaySlider, RunwayCard } from "./RunwayCard";
import { SquidQuoteReview } from "./SquidQuoteReview";
import { SquidRecoveryPanel } from "./SquidRecoveryPanel";

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
  recoveryRevision?: number;
};

export function GuidedTopUpDialog({
  accountId,
  accountSummary,
  isAccountSummaryLoading,
  onOpenChange,
  open,
  recoveryRevision = 0,
}: GuidedTopUpDialogProps) {
  const { constants, synapse } = useSynapse();
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const takeOriginalChainId = useOriginalWalletChain(open, chainId);
  // Set when the amount was prefilled for this open, so clearing the field
  // doesn't refill it (see the prefill effect below).
  const didPrefillAmount = useRef(false);
  const wasOpen = useRef(false);
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const acquisition = useGuidedSquidAcquisition({ address, destinationClient, open, recoveryRevision });
  const { acquiredAmount, acquisitionOwner, acquisitionState, recoveryPanelState, savedAcquisition } = acquisition;
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
  useEffect(() => {
    void address;
    void recoveryRevision;
    setIsSubmitting(false);
  }, [address, recoveryRevision]);

  useEffect(() => {
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

  const handleConfirm = async () => {
    if (
      !synapse ||
      acquiredAmount === null ||
      isSubmitting ||
      !acquisitionOwner ||
      !acquisitionOwnerMatches ||
      savedAcquisition?.status !== "acquired"
    )
      return;

    try {
      await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, async () => {
        const depositOwner = acquisitionOwner;
        const isCurrentDepositOwner = () => latestAddress.current?.toLowerCase() === depositOwner.toLowerCase();
        setIsSubmitting(true);
        const outcome = await runSquidDeposit({
          acquisition: savedAcquisition,
          amount: acquiredAmount,
          fund: (deposit, onHash) => synapse.payments.fundSync({ amount: deposit, onHash }),
          invalidate: (owner) => invalidateTopUpQueries(queryClient, accountId, owner),
          onRecoveryStateError: (reason) => {
            if (isCurrentDepositOwner()) {
              toast.warning(
                reason === "hash-persistence"
                  ? "The transaction was submitted, but its hash could not be saved. Verify it in your wallet before retrying."
                  : "The deposit succeeded, but its saved recovery state could not be cleared.",
              );
            }
          },
          onSubmitted: (_hash, pending) => {
            if (isCurrentDepositOwner()) {
              acquisition.recordPending(pending);
              toast.info("Top-up transaction submitted");
            }
          },
          storage: window.localStorage,
        });
        if (isCurrentDepositOwner()) {
          if (outcome.status === "succeeded") {
            toast.success("USDFC top-up confirmed");
            acquisition.reset();
            closeDialog();
          } else {
            if (outcome.status === "rejected") acquisition.recordAcquired(outcome.acquisition);
            else acquisition.recordBlocked(outcome.acquisition);
            toast.error("USDFC top-up failed", {
              description: walletErrorMessage(outcome.error, "Your wallet did not complete the request."),
            });
          }
          setIsSubmitting(false);
        }
      });
    } catch (error) {
      setIsSubmitting(false);
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
      if (await acquisition.clearBlocked()) closeDialog();
    } catch {
      toast.error("Browser storage is unavailable. The saved acquisition could not be cleared.");
    }
  };

  const clearInvalidAcquisition = async () => {
    if (!address || !window.confirm("Clear the invalid saved acquisition data from this browser?")) return;
    try {
      await acquisition.clearInvalid();
    } catch (error) {
      toast.error("The invalid saved acquisition could not be cleared.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const continueWithAcquiredUsdfc = async () => {
    try {
      await acquisition.continueWithAcquired();
    } catch (error) {
      toast.error("The acquisition could not be recovered safely.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const retryFilecoinDeposit = async () => {
    if (!window.confirm("Retry only after confirming the saved Filecoin transaction did not complete.")) return;
    try {
      await acquisition.retryDeposit();
    } catch {
      toast.error("Browser storage is unavailable. The deposit could not be recovered safely.");
    }
  };

  const renderRecoveryPanel = () => {
    if (!recoveryPanelState) return null;
    switch (recoveryPanelState.kind) {
      case "invalid-storage":
        return <SquidRecoveryPanel onClearInvalid={() => void clearInvalidAcquisition()} state={recoveryPanelState} />;
      case "storage-unavailable":
        return <SquidRecoveryPanel state={recoveryPanelState} />;
      case "manual-verification":
        return (
          <SquidRecoveryPanel
            onClear={() => void clearBlockedAcquisition()}
            onContinue={() => void continueWithAcquiredUsdfc()}
            state={recoveryPanelState}
          />
        );
      case "automatic-check":
        return <SquidRecoveryPanel onClear={() => void clearBlockedAcquisition()} state={recoveryPanelState} />;
      case "automatic-permanent-error":
        return <SquidRecoveryPanel onClear={() => void clearBlockedAcquisition()} state={recoveryPanelState} />;
      case "automatic-retryable-error":
        return (
          <SquidRecoveryPanel
            onClear={() => void clearBlockedAcquisition()}
            onRetryAutomatic={() => void acquisition.retryAutomaticRecovery()}
            state={recoveryPanelState}
          />
        );
      case "deposit-recovery":
        return (
          <SquidRecoveryPanel
            onClear={() => void clearBlockedAcquisition()}
            onRetryDeposit={() => void retryFilecoinDeposit()}
            state={recoveryPanelState}
          />
        );
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
    const chainIdToRestore = takeOriginalChainId();
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
          {renderRecoveryPanel()}
          {acquiredAmount === null && acquisitionState !== "blocked" && (
            <SquidQuoteReview
              acquisitionState={acquisitionState}
              destinationAmount={depositAmount}
              onAcquired={acquisition.recordAcquired}
              onBlocked={acquisition.recordBlocked}
              onNetworkSwitchingChange={setIsSwitchingNetwork}
              onRejected={acquisition.recordRejected}
              onStarted={acquisition.startProcessing}
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
