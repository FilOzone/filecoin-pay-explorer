/**
 * Calculate total lockup for a token using the current block number.
 *
 * Formula: lockupCurrent + lockupRate * (blockNumber - lockupLastSettledUntilEpoch)
 *
 * @param lockupCurrent - The current fixed lockup amount
 * @param lockupRate - The rate at which lockup increases per block
 * @param lockupLastSettledUntilEpoch - The block number when lockup was last settled
 * @param blockNumber - The current block number
 * @returns The total lockup amount as a string, or "0" if calculation fails
 *
 * @example
 * ```ts
 * const totalLockup = calculateTotalLockup(
 *   "1000",
 *   "10",
 *   "100",
 *   150n
 * );
 * // Returns: "1500" (1000 + 10 * (150 - 100))
 * ```
 */
export function calculateTotalLockup(
  lockupCurrent: bigint | string | undefined,
  lockupRate: bigint | string | undefined,
  lockupLastSettledUntilEpoch: bigint | string | undefined,
  blockNumber: bigint | string | undefined,
): string {
  // Handle missing data
  if (
    lockupCurrent === undefined ||
    lockupRate === undefined ||
    lockupLastSettledUntilEpoch === undefined ||
    blockNumber === undefined
  ) {
    return "0";
  }

  try {
    lockupCurrent = BigInt(lockupCurrent);
    lockupRate = BigInt(lockupRate);
    lockupLastSettledUntilEpoch = BigInt(lockupLastSettledUntilEpoch);
    blockNumber = BigInt(blockNumber);

    // If no streaming lockup (rate is 0), return only fixed lockup
    if (lockupRate === 0n) {
      return lockupCurrent.toString();
    }

    // If current block is before or equal to last settled, return only fixed lockup
    if (blockNumber <= lockupLastSettledUntilEpoch) {
      return lockupCurrent.toString();
    }

    // Calculate streaming lockup: rate * (blockNumber - lastSettled)
    const blockDelta = blockNumber - lockupLastSettledUntilEpoch;
    const streamingLockup = lockupRate * blockDelta;

    // Total lockup = fixed + streaming
    const totalLockup = lockupCurrent + streamingLockup;

    // Ensure non-negative result
    return totalLockup >= 0n ? totalLockup.toString() : "0";
  } catch (error) {
    console.error("Error calculating total lockup:", error);
    return "0";
  }
}
