import type { Address, Hash } from "viem";
import {
  beginSquidAcquisition,
  clearSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquiredFromBalance,
  markSquidBroadcast,
  markSquidIntermediateRouteCompleted,
  markSquidSwapRequested,
  resetSquidRouteAttempt,
  type SquidAcquisition,
} from "./squid-acquisition";
import { canClearSquidAcquisitionAfterError } from "./squid-execution";
import { FILECOIN_FIL_REQUIREMENT_ID } from "./squid-quote";

type AcquisitionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SquidAcquisitionOutcome =
  | { acquisition: SquidAcquisition; status: "acquired" }
  | { acquisition: SquidAcquisition; error: unknown; status: "blocked" }
  | { error: unknown; status: "failed" };

export async function runSquidAcquisition({
  execute,
  minimumDestinationAmount,
  onCheckpoint,
  onStarted,
  owner,
  readDestinationBalance,
  sourceChainId,
  storage,
}: {
  execute: (callbacks: {
    completedRequirementIds: readonly string[];
    onIntermediateRouteComplete: (requirementId: string) => void;
    onSwapAttempt: () => void;
    onSwapBroadcast: (hash: Hash) => void;
  }) => Promise<unknown>;
  minimumDestinationAmount: bigint;
  onCheckpoint?: (acquisition: SquidAcquisition) => void;
  onStarted?: (acquisition: SquidAcquisition) => void;
  owner: Address;
  readDestinationBalance: () => Promise<bigint>;
  sourceChainId: number;
  storage: AcquisitionStorage;
}): Promise<SquidAcquisitionOutcome> {
  let acquisition: SquidAcquisition;
  try {
    const saved = loadSquidAcquisition(storage, owner);
    if (saved) {
      if (
        saved.status !== "processing" ||
        saved.executionStage !== "preparing" ||
        !saved.completedRequirementIds?.includes(FILECOIN_FIL_REQUIREMENT_ID) ||
        saved.destinationAmount !== minimumDestinationAmount ||
        saved.sourceChainId !== sourceChainId
      ) {
        throw new Error("A saved Squid acquisition already exists");
      }
      acquisition = saved;
    } else {
      acquisition = beginSquidAcquisition(
        storage,
        owner,
        minimumDestinationAmount,
        await readDestinationBalance(),
        sourceChainId,
      );
    }
  } catch (error) {
    return { error, status: "failed" };
  }

  try {
    onStarted?.(acquisition);
    await execute({
      completedRequirementIds: acquisition.completedRequirementIds ?? [],
      onIntermediateRouteComplete: (requirementId) => {
        acquisition = markSquidIntermediateRouteCompleted(storage, acquisition, requirementId);
        onCheckpoint?.(acquisition);
      },
      onSwapAttempt: () => {
        acquisition = markSquidSwapRequested(storage, acquisition);
      },
      onSwapBroadcast: (hash) => {
        acquisition = markSquidBroadcast(storage, acquisition, hash);
      },
    });
    const acquired = markSquidAcquiredFromBalance(storage, acquisition, await readDestinationBalance());
    return { acquisition: acquired, status: "acquired" };
  } catch (error) {
    if (
      acquisition.completedRequirementIds?.length &&
      canClearSquidAcquisitionAfterError(acquisition.executionStage, error)
    ) {
      if (acquisition.executionStage === "swap-requested") {
        try {
          acquisition = resetSquidRouteAttempt(storage, acquisition);
        } catch {
          // Preserve the ambiguous request below if the checkpoint cannot be reset safely.
        }
      }
      if (acquisition.executionStage === "preparing") return { error, status: "failed" };
    }
    if (
      acquisition.transactionHashes.length === 0 &&
      canClearSquidAcquisitionAfterError(acquisition.executionStage, error)
    ) {
      try {
        clearSquidAcquisition(storage, acquisition);
        return { error, status: "failed" };
      } catch {
        // The marker advanced concurrently or storage became unavailable.
        // Preserve the latest recoverable state below.
      }
    }
    let latestAcquisition = acquisition;
    try {
      latestAcquisition = loadSquidAcquisition(storage, owner) ?? acquisition;
    } catch {
      // Storage may have become unavailable after the durable marker was
      // created. Return the in-memory marker so the UI still leaves its
      // uncloseable processing state and surfaces manual recovery.
    }
    return { acquisition: latestAcquisition, error, status: "blocked" };
  }
}
