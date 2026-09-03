import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import {
  type AcquiredSquidAcquisition,
  clearInvalidSquidAcquisition,
  clearSquidAcquisition,
  type DepositingSquidAcquisition,
  getSquidDepositAmount,
  hasSameSquidAcquisitionSnapshot,
  hasSavedSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidAcquiredFromBalance,
  type ProcessingSquidAcquisition,
  resetSquidDeposit,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { isAutomaticSquidRecoveryCandidate } from "../data/squid-acquisition-recovery";
import { readUsdfcBalance } from "../data/usdfc-balance";
import { useSquidAcquisitionRecovery } from "./useSquidAcquisitionRecovery";

export type SquidAcquisitionState = "acquired" | "blocked" | "idle" | "processing";
export type SquidRecoveryPanelState =
  | { kind: "invalid-storage" }
  | { kind: "storage-unavailable" }
  | {
      acquisition: ProcessingSquidAcquisition;
      coordinationError: string | null;
      kind: "manual-verification";
      sourceChainName?: string;
    }
  | {
      acquisition: ProcessingSquidAcquisition;
      isFetching: boolean;
      kind: "automatic-check";
      sourceChainName?: string;
    }
  | {
      acquisition: ProcessingSquidAcquisition;
      kind: "automatic-retryable-error";
      message: string;
      sourceChainName?: string;
    }
  | {
      acquisition: ProcessingSquidAcquisition;
      kind: "automatic-permanent-error";
      message: string;
      sourceChainName?: string;
    }
  | { acquisition: DepositingSquidAcquisition; kind: "deposit-recovery" };

export function useGuidedSquidAcquisition({
  address,
  destinationClient,
  open,
  recoveryRevision,
}: {
  address?: Address;
  destinationClient?: Pick<PublicClient, "readContract">;
  open: boolean;
  recoveryRevision: number;
}) {
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionOwner, setAcquisitionOwner] = useState<Address | null>(null);
  const [savedAcquisition, setSavedAcquisition] = useState<SquidAcquisition | null>(null);
  const [hasInvalidAcquisition, setHasInvalidAcquisition] = useState(false);
  const [coordinationError, setCoordinationError] = useState<string | null>(null);
  const [automaticRecoveryError, setAutomaticRecoveryError] = useState<string | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<SquidAcquisitionState>("idle");
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const automaticRecovery = useSquidAcquisitionRecovery(savedAcquisition, address);

  const applySavedAcquisition = useCallback((saved: SquidAcquisition | null, hasSaved = saved !== null) => {
    const invalid = hasSaved && saved === null;
    setSavedAcquisition(saved);
    setHasInvalidAcquisition(invalid);
    setCoordinationError(null);
    setAutomaticRecoveryError(null);
    setAcquisitionOwner(saved?.owner ?? null);
    setAcquiredAmount(saved?.status === "acquired" ? getSquidDepositAmount(saved) : null);
    setAcquisitionState(saved?.status === "acquired" ? "acquired" : saved || invalid ? "blocked" : "idle");
  }, []);

  useEffect(() => {
    void recoveryRevision;
    let cancelled = false;
    const apply = (saved: SquidAcquisition | null, hasSaved: boolean) => {
      if (!cancelled) applySavedAcquisition(saved, hasSaved);
    };

    if (!address) {
      apply(null, false);
      return;
    }

    try {
      const hasSaved = hasSavedSquidAcquisition(window.localStorage, address);
      const saved = loadSquidAcquisition(window.localStorage, address);
      apply(saved, hasSaved);
      if (!open || saved?.status !== "processing" || saved.executionStage !== "preparing") return;

      void withSquidAcquisitionLock(globalThis.navigator?.locks, saved.owner, () => {
        const current = loadSquidAcquisition(window.localStorage, saved.owner);
        if (
          current?.status === "processing" &&
          current.executionStage === "preparing" &&
          hasSameSquidAcquisitionSnapshot(current, saved)
        ) {
          clearSquidAcquisition(window.localStorage, current);
        }
      })
        .then(() => {
          apply(
            loadSquidAcquisition(window.localStorage, saved.owner),
            hasSavedSquidAcquisition(window.localStorage, saved.owner),
          );
        })
        .catch((error) => {
          if (cancelled) return;
          try {
            apply(
              loadSquidAcquisition(window.localStorage, saved.owner),
              hasSavedSquidAcquisition(window.localStorage, saved.owner),
            );
          } catch {
            setSavedAcquisition(null);
            setHasInvalidAcquisition(false);
            setAcquisitionOwner(null);
            setAcquiredAmount(null);
            setAcquisitionState("blocked");
          }
          setCoordinationError(
            error instanceof Error ? error.message : "Funding coordination is unavailable in this tab",
          );
        });
    } catch {
      setAcquiredAmount(null);
      setAcquisitionOwner(null);
      setSavedAcquisition(null);
      setHasInvalidAcquisition(false);
      setCoordinationError(null);
      setAutomaticRecoveryError(null);
      setAcquisitionState("blocked");
    }
    return () => {
      cancelled = true;
    };
  }, [address, applySavedAcquisition, open, recoveryRevision]);

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
        applySavedAcquisition(acquired);
      })
      .catch((error) => {
        if (cancelled || latestAddress.current?.toLowerCase() !== pending.owner.toLowerCase()) return;
        try {
          const latest = loadSquidAcquisition(window.localStorage, pending.owner);
          if (latest && !hasSameSquidAcquisitionSnapshot(latest, pending)) {
            applySavedAcquisition(latest);
            return;
          }
        } catch {
          // Preserve the transition error; the next poll retries the read.
        }
        setAutomaticRecoveryError(error instanceof Error ? error.message : "Automatic recovery could not continue");
      });
    return () => {
      cancelled = true;
    };
  }, [applySavedAcquisition, automaticRecovery.data, automaticRecovery.dataUpdatedAt, savedAcquisition]);

  const recordAcquired = (acquisition: AcquiredSquidAcquisition) => applySavedAcquisition(acquisition);
  const startProcessing = (acquisition: ProcessingSquidAcquisition) => {
    setSavedAcquisition(acquisition);
    setHasInvalidAcquisition(false);
    setCoordinationError(null);
    setAutomaticRecoveryError(null);
    setAcquisitionOwner(acquisition.owner);
    setAcquiredAmount(null);
    setAcquisitionState("processing");
  };
  const recordBlocked = (acquisition: DepositingSquidAcquisition | ProcessingSquidAcquisition) => {
    setSavedAcquisition(acquisition);
    setHasInvalidAcquisition(false);
    setAutomaticRecoveryError(null);
    setAcquisitionOwner(acquisition.owner);
    setAcquiredAmount(null);
    setAcquisitionState("blocked");
  };
  const recordPending = (acquisition: DepositingSquidAcquisition) => setSavedAcquisition(acquisition);
  const recordRejected = () => applySavedAcquisition(null, false);
  const retryAutomaticRecovery = () => {
    setAutomaticRecoveryError(null);
    return automaticRecovery.refetch();
  };
  const isCurrentOwner = (owner: Address) => latestAddress.current?.toLowerCase() === owner.toLowerCase();

  const clearBlocked = async () => {
    const pending = savedAcquisition;
    if (!pending) return false;
    await withSquidAcquisitionLock(globalThis.navigator?.locks, pending.owner, () =>
      clearSquidAcquisition(window.localStorage, pending),
    );
    if (!isCurrentOwner(pending.owner)) return false;
    const completedDeposit = pending.status === "depositing";
    applySavedAcquisition(null, false);
    return completedDeposit;
  };

  const clearInvalid = async () => {
    const owner = address;
    if (!owner) return;
    await withSquidAcquisitionLock(globalThis.navigator?.locks, owner, () =>
      clearInvalidSquidAcquisition(window.localStorage, owner),
    );
    if (!isCurrentOwner(owner)) return;
    setHasInvalidAcquisition(false);
    setAutomaticRecoveryError(null);
    setAcquisitionState("idle");
  };

  const continueWithAcquired = async () => {
    const pending = savedAcquisition;
    if (pending?.status !== "processing") return;
    const acquired = await withSquidAcquisitionLock(globalThis.navigator?.locks, pending.owner, async () => {
      if (pending.destinationBalanceBefore === undefined) {
        return markSquidAcquired(window.localStorage, pending);
      }
      if (!destinationClient) throw new Error("Filecoin balance client is unavailable");
      const balance = await readUsdfcBalance(destinationClient, mainnet.contracts.usdfc.address, pending.owner);
      return markSquidAcquiredFromBalance(window.localStorage, pending, balance);
    });
    if (isCurrentOwner(acquired.owner)) recordAcquired(acquired);
  };

  const retryDeposit = async () => {
    const pending = savedAcquisition;
    if (pending?.status !== "depositing") return;
    const acquired = await withSquidAcquisitionLock(globalThis.navigator?.locks, pending.owner, () =>
      resetSquidDeposit(window.localStorage, pending),
    );
    if (isCurrentOwner(acquired.owner)) recordAcquired(acquired);
  };

  const reset = () => applySavedAcquisition(null, false);
  const sourceChainName = SQUID_SOURCE_CHAINS.find((chain) => chain.id === savedAcquisition?.sourceChainId)?.name;
  const automaticErrorMessage =
    automaticRecoveryError ??
    (automaticRecovery.error instanceof Error
      ? automaticRecovery.error.message
      : automaticRecovery.error
        ? "Automatic recovery could not continue"
        : null);
  let recoveryPanelState: SquidRecoveryPanelState | null = null;
  if (acquisitionState === "blocked") {
    if (hasInvalidAcquisition) {
      recoveryPanelState = { kind: "invalid-storage" };
    } else if (savedAcquisition?.status === "depositing") {
      recoveryPanelState = { acquisition: savedAcquisition, kind: "deposit-recovery" };
    } else if (savedAcquisition?.status === "processing") {
      recoveryPanelState = automaticRecovery.isEligible
        ? automaticErrorMessage
          ? {
              acquisition: savedAcquisition,
              kind: automaticRecovery.isPermanentError ? "automatic-permanent-error" : "automatic-retryable-error",
              message: automaticErrorMessage,
              sourceChainName,
            }
          : {
              acquisition: savedAcquisition,
              isFetching: automaticRecovery.isFetching,
              kind: "automatic-check",
              sourceChainName,
            }
        : {
            acquisition: savedAcquisition,
            coordinationError,
            kind: "manual-verification",
            sourceChainName,
          };
    } else {
      recoveryPanelState = { kind: "storage-unavailable" };
    }
  }

  return {
    acquiredAmount,
    acquisitionOwner,
    acquisitionState,
    clearBlocked,
    clearInvalid,
    continueWithAcquired,
    recordAcquired,
    recordBlocked,
    recordPending,
    recordRejected,
    reset,
    retryAutomaticRecovery,
    retryDeposit,
    recoveryPanelState,
    savedAcquisition,
    startProcessing,
  };
}
