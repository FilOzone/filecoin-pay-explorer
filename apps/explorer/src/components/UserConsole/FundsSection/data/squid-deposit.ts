import type { Address, Hash } from "viem";
import {
  clearSquidAcquisition,
  markSquidDepositPending,
  resetSquidDeposit,
  type SquidAcquisition,
} from "./squid-acquisition";
import { isUserRejectedRequest } from "./squid-execution";

type AcquisitionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SquidDepositOutcome =
  | { acquisition: SquidAcquisition; status: "succeeded" }
  | { acquisition: SquidAcquisition; error: unknown; status: "blocked" | "rejected" };
export type SquidRecoveryStateError = "cleanup" | "hash-persistence";

export async function runSquidDeposit({
  acquisition,
  amount,
  fund,
  invalidate,
  onRecoveryStateError,
  onSubmitted,
  storage,
}: {
  acquisition: SquidAcquisition;
  amount: bigint;
  fund: (amount: bigint, onHash: (hash: Hash) => void) => Promise<{ receipt: { status: string } }>;
  invalidate: (owner: Address) => Promise<unknown>;
  onRecoveryStateError?: (reason: SquidRecoveryStateError) => void;
  onSubmitted?: (hash: Hash, acquisition: SquidAcquisition) => void;
  storage: AcquisitionStorage;
}): Promise<SquidDepositOutcome> {
  let pending = markSquidDepositPending(storage, acquisition);
  let didBroadcast = false;

  try {
    const { receipt } = await fund(amount, (hash) => {
      didBroadcast = true;
      try {
        pending = markSquidDepositPending(storage, pending, hash);
      } catch {
        onRecoveryStateError?.("hash-persistence");
      }
      onSubmitted?.(hash, pending);
    });
    if (receipt.status !== "success") throw new Error("Top-up transaction reverted");
    await invalidate(acquisition.owner);
    try {
      clearSquidAcquisition(storage, pending);
    } catch {
      onRecoveryStateError?.("cleanup");
    }
    return { acquisition: pending, status: "succeeded" };
  } catch (error) {
    if (!didBroadcast && isUserRejectedRequest(error)) {
      try {
        return { acquisition: resetSquidDeposit(storage, pending), error, status: "rejected" };
      } catch {
        // The exact marker cannot be restored, so retain the pending snapshot
        // and require manual verification.
      }
    }
    return { acquisition: pending, error, status: "blocked" };
  }
}
