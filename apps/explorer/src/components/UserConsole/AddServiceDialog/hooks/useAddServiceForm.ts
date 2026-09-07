// Owns the deposit-amount and spending-limits half of the form — the half
// that doesn't need its own network reads, unlike service/token selection
// (useServiceSelection, useTokenSelection). Transaction orchestration lives
// in useAddServiceLifecycle.
import { useCallback, useState } from "react";
import { maxUint256, parseUnits } from "viem";
import { z } from "zod";
import type { PaymentTokenDetails } from "./useTokenSelection";

export interface SubmitAmounts {
  /** Parsed deposit amount; null or 0n approves without depositing. */
  parsedDeposit: bigint | null;
  lockupInWei: bigint;
  rateInWei: bigint;
}

export interface AddServiceForm {
  depositAmount: string;
  setDepositAmount: (value: string) => void;
  isDepositing: boolean;
  hasSufficientBalance: boolean;
  showLimits: boolean;
  toggleShowLimits: () => void;
  isUnlimited: boolean;
  setIsUnlimited: (value: boolean) => void;
  lockupAllowance: string;
  setLockupAllowance: (value: string) => void;
  rateAllowance: string;
  setRateAllowance: (value: string) => void;
  canSubmit: boolean;
  /** Only meaningful once `canSubmit` is true; use that to gate the submit button, not a null check here. */
  buildSubmitAmounts: () => SubmitAmounts | null;
  /** Clears amounts entered for a token that's no longer selected. */
  clearAmounts: () => void;
  reset: () => void;
}

interface UseAddServiceFormArgs {
  token: PaymentTokenDetails | null;
  balance: bigint | undefined;
  supportsPermit: boolean;
  /** Whether a valid operator is currently selected — the one input this form doesn't own. */
  isOperatorSelected: boolean;
  isBusy: boolean;
}

/** Parses a limit field: "" means no limit entered (0n), anything unparseable is null. Callers decide separately what a missing token means. */
function parseLimit(input: string, decimals: number): bigint | null {
  if (!input.trim()) return 0n;
  try {
    return parseUnits(input.trim(), decimals);
  } catch {
    return null;
  }
}

const customLimitsSchema = z
  .object({ lockupInWei: z.bigint().nonnegative(), rateInWei: z.bigint().nonnegative() })
  .refine((limits) => limits.lockupInWei > 0n || limits.rateInWei > 0n, {
    message: "Enter at least one limit greater than zero.",
  });

export function useAddServiceForm({
  token,
  balance,
  supportsPermit,
  isOperatorSelected,
  isBusy,
}: UseAddServiceFormArgs): AddServiceForm {
  const [depositAmount, setDepositAmount] = useState("");

  // Spending limits are an advanced disclosure; the default grant is unlimited.
  const [showLimits, setShowLimits] = useState(false);
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [rateAllowance, setRateAllowance] = useState("");

  const toggleShowLimits = useCallback(() => setShowLimits((prev) => !prev), []);

  // Numeric inputs can still contain values that `parseUnits` rejects.
  const parsedDeposit = (() => {
    if (!depositAmount.trim() || !token) return null;
    try {
      return parseUnits(depositAmount.trim(), token.decimals);
    } catch {
      return null;
    }
  })();
  const isDepositing = parsedDeposit !== null && parsedDeposit > 0n;

  // null covers both "no token yet" and "unparseable input"
  // needs to tell them apart, since either way a custom limit isn't usable.
  const lockupInWei = isUnlimited ? maxUint256 : token && parseLimit(lockupAllowance, token.decimals);
  const rateInWei = isUnlimited ? maxUint256 : token && parseLimit(rateAllowance, token.decimals);

  const hasValidCustomLimits = customLimitsSchema.safeParse({ lockupInWei, rateInWei }).success;
  const areLimitsValid = isUnlimited || hasValidCustomLimits;

  // Nothing blocking on the deposit side: either no amount was entered, or it's a valid, permit-capable one.
  const isDepositAmountAcceptable = !depositAmount.trim() || (isDepositing && supportsPermit);
  // Reject over-balance deposits before collecting a permit signature.
  const hasSufficientBalance =
    !isDepositing || (balance !== undefined && parsedDeposit !== null && parsedDeposit <= balance);

  const canSubmit =
    isOperatorSelected && !!token && isDepositAmountAcceptable && hasSufficientBalance && areLimitsValid && !isBusy;

  const buildSubmitAmounts = useCallback((): SubmitAmounts | null => {
    if (!token || typeof lockupInWei !== "bigint" || typeof rateInWei !== "bigint") return null;
    return { parsedDeposit, lockupInWei, rateInWei };
  }, [token, parsedDeposit, lockupInWei, rateInWei]);

  const clearAmounts = useCallback(() => {
    setDepositAmount("");
    setLockupAllowance("");
    setRateAllowance("");
  }, []);

  const reset = useCallback(() => {
    setDepositAmount("");
    setShowLimits(false);
    setIsUnlimited(true);
    setLockupAllowance("");
    setRateAllowance("");
  }, []);

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    hasSufficientBalance,
    showLimits,
    toggleShowLimits,
    isUnlimited,
    setIsUnlimited,
    lockupAllowance,
    setLockupAllowance,
    rateAllowance,
    setRateAllowance,
    canSubmit,
    buildSubmitAmounts,
    clearAmounts,
    reset,
  };
}
