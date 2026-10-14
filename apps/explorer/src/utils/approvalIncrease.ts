import { maxUint256, parseUnits } from "viem";

export type ApprovalIncreaseInput = {
  lockup: string;
  rate: string;
  maxLockupPeriod: string;
  isUnlimited: boolean;
};

export type ApprovalTotals = { lockup: bigint; rate: bigint; maxLockupPeriod: bigint };
export type ApprovalIncrease =
  | { status: "invalid" }
  | { status: "unchanged" }
  | { status: "ready"; totals: ApprovalTotals };

export function computeIncreasedApproval(
  input: ApprovalIncreaseInput,
  current: ApprovalTotals,
  decimals: number,
): ApprovalIncrease {
  const totals = input.isUnlimited
    ? { lockup: maxUint256, rate: maxUint256, maxLockupPeriod: maxUint256 }
    : addIncreases(input, current, decimals);
  if (!totals || Object.values(totals).some((total) => total > maxUint256)) return { status: "invalid" };

  const unchanged =
    totals.lockup === current.lockup &&
    totals.rate === current.rate &&
    totals.maxLockupPeriod === current.maxLockupPeriod;
  return unchanged ? { status: "unchanged" } : { status: "ready", totals };
}

function addIncreases(input: ApprovalIncreaseInput, current: ApprovalTotals, decimals: number): ApprovalTotals | null {
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
