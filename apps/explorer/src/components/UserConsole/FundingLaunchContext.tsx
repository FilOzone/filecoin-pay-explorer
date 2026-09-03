"use client";

import type { UserToken } from "@filecoin-pay/types";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type AddFundsOptions = {
  /** The token a plain deposit should open on, when the caller is showing one. */
  depositToken?: UserToken | null;
};

type FundingLaunch = {
  /** Whether the console-wide add-funds request is open (the picker, or the deposit where that is all there is). */
  isAddFundsOpen: boolean;
  openAddFunds: (options?: AddFundsOptions) => void;
  closeAddFunds: () => void;
  /** The token the latest add-funds request asked a deposit to open on. */
  depositToken: UserToken | null;
  /** Whether the console-wide "Pay with USDC" dialog is open. */
  isUsdcFundingOpen: boolean;
  openUsdcFunding: () => void;
  closeUsdcFunding: () => void;
  /** Opens the guided any-token swap, while the dashboard that owns it is mounted. */
  guidedTopUp: (() => void) | null;
  setGuidedTopUp: (open: (() => void) | null) => void;
};

const FundingLaunchContext = createContext<FundingLaunch | null>(null);

/**
 * Holds the open state of the funding dialogs for the whole console. The
 * wallet menu, the dashboard and the first-time trigger all open the same
 * picker and the same USDC dialog, which FundingHost renders exactly once, so
 * a request to fund is never dropped for want of a listener.
 */
export function FundingLaunchProvider({ children }: { children: ReactNode }) {
  const [isAddFundsOpen, setAddFundsOpen] = useState(false);
  const [depositToken, setDepositToken] = useState<UserToken | null>(null);
  const [isUsdcFundingOpen, setUsdcFundingOpen] = useState(false);
  const [guidedTopUp, setGuidedTopUpState] = useState<(() => void) | null>(null);
  const openAddFunds = useCallback((options?: AddFundsOptions) => {
    setDepositToken(options?.depositToken ?? null);
    setAddFundsOpen(true);
  }, []);
  const closeAddFunds = useCallback(() => setAddFundsOpen(false), []);
  const openUsdcFunding = useCallback(() => setUsdcFundingOpen(true), []);
  const closeUsdcFunding = useCallback(() => setUsdcFundingOpen(false), []);
  // Wrapped so a function is stored rather than run as a state updater.
  const setGuidedTopUp = useCallback((open: (() => void) | null) => setGuidedTopUpState(() => open), []);
  const value = useMemo(
    () => ({
      isAddFundsOpen,
      openAddFunds,
      closeAddFunds,
      depositToken,
      isUsdcFundingOpen,
      openUsdcFunding,
      closeUsdcFunding,
      guidedTopUp,
      setGuidedTopUp,
    }),
    [
      isAddFundsOpen,
      openAddFunds,
      closeAddFunds,
      depositToken,
      isUsdcFundingOpen,
      openUsdcFunding,
      closeUsdcFunding,
      guidedTopUp,
      setGuidedTopUp,
    ],
  );
  return <FundingLaunchContext.Provider value={value}>{children}</FundingLaunchContext.Provider>;
}

export function useFundingLaunch(): FundingLaunch {
  const launch = useContext(FundingLaunchContext);
  if (!launch) throw new Error("useFundingLaunch must be used within FundingLaunchProvider");
  return launch;
}
