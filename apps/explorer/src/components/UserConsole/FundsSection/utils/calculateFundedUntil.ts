import type { UserToken } from "@filecoin-pay/types";
import { maxUint256 } from "viem";
import { EPOCH_DURATION } from "@/utils/constants";

export type FundedUntil = {
  /** Withdrawable balance, clamped to `0n` when the account is in deficit. */
  availableFunds: bigint;
  /** Outstanding obligation the account can't cover; `0n` when it is still solvent. */
  debt: bigint;
  /** Unix seconds at which funds run out; `maxUint256` when there is no active spend. */
  fundedUntilTimestamp: bigint;
  /** Lockup rolled forward from the last settled epoch to now. */
  simulatedLockupCurrent: bigint;
};

/**
 * Rolls a token's on-chain lockup forward to `currentTimestamp` and derives the
 * four figures the funds overview reports. Call once per selected token.
 */
export const calculateFundedUntil = (userToken: UserToken, currentTimestamp: bigint): FundedUntil => {
  const funds = BigInt(userToken.funds);
  const lockupCurrent = BigInt(userToken.lockupCurrent);
  const lastSettledAt = BigInt(userToken.lockupLastSettledUntilEpoch);
  const lastSettledTimestamp = BigInt(userToken.lockupLastSettledUntilTimestamp);
  const lockupRate = BigInt(userToken.lockupRate);

  let elapsedEpochs = 0n;
  if (currentTimestamp > lastSettledTimestamp) {
    elapsedEpochs = (currentTimestamp - lastSettledTimestamp) / BigInt(EPOCH_DURATION);
  }

  const currentEpoch = lastSettledAt + elapsedEpochs;

  const fundedUntilEpoch = lockupRate === 0n ? maxUint256 : lastSettledAt + (funds - lockupCurrent) / lockupRate;
  const simulatedSettledAt = fundedUntilEpoch < currentEpoch ? fundedUntilEpoch : currentEpoch;
  const simulatedLockupCurrent = lockupCurrent + lockupRate * (simulatedSettledAt - lastSettledAt);

  const rawAvailable = funds - simulatedLockupCurrent;
  const availableFunds = rawAvailable > 0n ? rawAvailable : 0n;

  const fundedUntilTimestamp =
    lockupRate === 0n ? maxUint256 : lastSettledTimestamp + (fundedUntilEpoch - lastSettledAt) * BigInt(EPOCH_DURATION);

  // Debt is a streaming-rate deficit signal only. The snapshot is taken at
  // `lockupLastSettledUntilEpoch` and projected forward, and only the
  // `lockupRate * elapsedEpochs` term can push `totalOwed` past `funds`.
  //
  // At `lockupRate === 0n` that term is zero, so `totalOwed` collapses to the
  // snapshotted `lockupCurrent` — and the contract enforces `funds >= lockupCurrent`
  // at every entry point, at every settlement. Debt is therefore structurally `0n`
  // whenever the rate is zero: the rate term is dead code there, not anticipation
  // of a reachable state. Don't special-case zero-rate debt; it cannot occur.
  const totalOwed = lockupCurrent + lockupRate * elapsedEpochs;
  let debt = 0n;
  if (totalOwed > funds) {
    debt = totalOwed - funds;
  }

  return {
    availableFunds,
    debt,
    fundedUntilTimestamp,
    simulatedLockupCurrent,
  };
};
