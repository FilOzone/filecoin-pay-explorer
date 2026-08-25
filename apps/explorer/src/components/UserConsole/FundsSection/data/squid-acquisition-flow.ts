import type { Address, Hash } from "viem";
import {
  beginSquidAcquisition,
  clearSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquiredFromBalance,
  markSquidBroadcast,
  markSquidSwapRequested,
  type SquidAcquisition,
} from "./squid-acquisition";
import { canClearSquidAcquisitionAfterError } from "./squid-execution";

type AcquisitionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SquidAcquisitionOutcome =
  | { acquisition: SquidAcquisition; status: "acquired" }
  | { acquisition: SquidAcquisition; error: unknown; status: "blocked" }
  | { error: unknown; status: "failed" };

export async function runSquidAcquisition({
  execute,
  minimumDestinationAmount,
  onStarted,
  owner,
  readDestinationBalance,
  sourceChainId,
  storage,
}: {
  execute: (callbacks: { onSwapAttempt: () => void; onSwapBroadcast: (hash: Hash) => void }) => Promise<unknown>;
  minimumDestinationAmount: bigint;
  onStarted?: (acquisition: SquidAcquisition) => void;
  owner: Address;
  readDestinationBalance: () => Promise<bigint>;
  sourceChainId: number;
  storage: AcquisitionStorage;
}): Promise<SquidAcquisitionOutcome> {
  let destinationBalanceBefore: bigint;
  try {
    destinationBalanceBefore = await readDestinationBalance();
  } catch (error) {
    return { error, status: "failed" };
  }

  let acquisition: SquidAcquisition;
  try {
    acquisition = beginSquidAcquisition(
      storage,
      owner,
      minimumDestinationAmount,
      destinationBalanceBefore,
      sourceChainId,
    );
  } catch (error) {
    return { error, status: "failed" };
  }

  try {
    onStarted?.(acquisition);
    await execute({
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
