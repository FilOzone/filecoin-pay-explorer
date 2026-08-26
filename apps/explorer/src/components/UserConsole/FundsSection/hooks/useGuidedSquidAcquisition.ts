import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import { mainnet } from "@/constants/chains";
import {
  clearInvalidSquidAcquisition,
  clearSquidAcquisition,
  getSquidDepositAmount,
  hasSameSquidAcquisitionSnapshot,
  hasSavedSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidAcquiredFromBalance,
  resetSquidDeposit,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { isAutomaticSquidRecoveryCandidate } from "../data/squid-acquisition-recovery";
import { readUsdfcBalance } from "../data/usdfc-balance";
import { useSquidAcquisitionRecovery } from "./useSquidAcquisitionRecovery";

export type SquidAcquisitionState = "acquired" | "blocked" | "idle" | "processing";

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

  const recordAcquired = (acquisition: SquidAcquisition) => applySavedAcquisition(acquisition);
  const recordBlocked = (acquisition: SquidAcquisition) => {
    setSavedAcquisition(acquisition);
    setAcquisitionOwner(acquisition.owner);
    setAcquiredAmount(null);
    setAcquisitionState("blocked");
  };
  const recordPending = (acquisition: SquidAcquisition) => setSavedAcquisition(acquisition);

  const clearBlocked = async () => {
    if (!savedAcquisition) return false;
    await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, () =>
      clearSquidAcquisition(window.localStorage, savedAcquisition),
    );
    const completedDeposit = savedAcquisition.status === "depositing";
    applySavedAcquisition(null, false);
    return completedDeposit;
  };

  const clearInvalid = async () => {
    if (!address) return;
    await withSquidAcquisitionLock(globalThis.navigator?.locks, address, () =>
      clearInvalidSquidAcquisition(window.localStorage, address),
    );
    setHasInvalidAcquisition(false);
    setAutomaticRecoveryError(null);
    setAcquisitionState("idle");
  };

  const continueWithAcquired = async () => {
    if (savedAcquisition?.status !== "processing") return;
    const acquired = await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, async () => {
      if (savedAcquisition.destinationBalanceBefore === undefined) {
        return markSquidAcquired(window.localStorage, savedAcquisition);
      }
      if (!destinationClient) throw new Error("Filecoin balance client is unavailable");
      const balance = await readUsdfcBalance(
        destinationClient,
        mainnet.contracts.usdfc.address,
        savedAcquisition.owner,
      );
      return markSquidAcquiredFromBalance(window.localStorage, savedAcquisition, balance);
    });
    recordAcquired(acquired);
  };

  const retryDeposit = async () => {
    if (savedAcquisition?.status !== "depositing") return;
    const acquired = await withSquidAcquisitionLock(globalThis.navigator?.locks, savedAcquisition.owner, () =>
      resetSquidDeposit(window.localStorage, savedAcquisition),
    );
    recordAcquired(acquired);
  };

  const reset = () => applySavedAcquisition(null, false);

  return {
    acquiredAmount,
    acquisitionOwner,
    acquisitionState,
    automaticRecovery,
    automaticRecoveryError,
    clearBlocked,
    clearInvalid,
    continueWithAcquired,
    coordinationError,
    hasInvalidAcquisition,
    recordAcquired,
    recordBlocked,
    recordPending,
    reset,
    retryDeposit,
    savedAcquisition,
    setAcquisitionState,
    setAutomaticRecoveryError,
  };
}
