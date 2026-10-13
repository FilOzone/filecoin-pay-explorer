import { maxUint256, parseUnits } from "viem";

export type ApprovalIncreaseInput = {
  lockup: string;
  rate: string;
  maxLockupPeriod: string;
  isUnlimited: boolean;
};

export type ApprovalTotals = { lockup: bigint; rate: bigint; maxLockupPeriod: bigint };

// New allowance totals for an increase, or null if an input is unparsable or a total exceeds unint256.
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

  const totals = {
    lockup: current.lockup + lockup,
    rate: current.rate + rate,
    maxLockupPeriod: current.maxLockupPeriod + period,
  };
  return Object.values(totals).some((total) => total > maxUint256) ? null : totals;
}

// <input type=number> allow `1e5`, which viem's parseUnits/BigInt reject.
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

// Epochs must be a whole number.
function parseEpochs(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}
