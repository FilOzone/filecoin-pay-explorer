import { maxUint256, parseUnits } from "viem";

export type ApprovalIncreaseInput = {
  lockup: string;
  rate: string;
  maxLockupPeriod: string;
  isUnlimited: boolean;
};

export type ApprovalTotals = { lockup: bigint; rate: bigint; maxLockupPeriod: bigint };

/**
 * New allowance totals for an increase, or null when an input is unparsable.
 * <input type=number> accepts values such as `1e5` that viem's `parseUnits` and
 * `BigInt` reject, and the lockup period is a whole number of epochs.
 */
export function computeIncreasedApproval(
  input: ApprovalIncreaseInput,
  current: ApprovalTotals,
  decimals: number,
): ApprovalTotals | null {
  if (input.isUnlimited) return { lockup: maxUint256, rate: maxUint256, maxLockupPeriod: maxUint256 };

  const lockup = parseAmount(input.lockup, decimals);
  const rate = parseAmount(input.rate, decimals);
  const period = parseEpochs(input.maxLockupPeriod);
  if (lockup === null || rate === null || period === null) return null;

  return {
    lockup: current.lockup + lockup,
    rate: current.rate + rate,
    maxLockupPeriod: current.maxLockupPeriod + period,
  };
}

function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  try {
    const parsed = parseUnits(trimmed, decimals);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseEpochs(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}
