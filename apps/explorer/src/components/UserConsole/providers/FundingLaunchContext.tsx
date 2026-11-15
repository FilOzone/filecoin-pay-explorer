"use client";

import type { UserToken } from "@filecoin-pay/types";
import { usePrivy } from "@privy-io/react-auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

type FundingLaunch = {
  depositToken: UserToken | null;
  isAddFundsOpen: boolean;
  isSquidOpen: boolean;
  openAddFunds: (depositToken?: UserToken | null) => void;
  /** The user dismissed Add funds or picked a method, which spends a signup request. */
  closeAddFunds: () => void;
  /** The wallet changed chain; a signup request survives so the overview can open Add funds again. */
  closeAddFundsForChainChange: () => void;
  openSquid: () => void;
  closeSquid: () => void;
  /** The signed-in Privy user was just created and has not yet acted on Add funds. */
  isFundingAfterSignup: boolean;
  requestFundingAfterSignup: (userId: string) => void;
};
const FundingLaunchContext = createContext<FundingLaunch | null>(null);

export function FundingLaunchProvider({ children }: { children: ReactNode }) {
  const userId = usePrivy().user?.id ?? null;
  const [isAddFundsOpen, setAddFundsOpen] = useState(false);
  const [isSquidOpen, setSquidOpen] = useState(false);
  const [depositToken, setDepositToken] = useState<UserToken | null>(null);
  const [signupUserId, setSignupUserId] = useState<string | null>(null);
  // The provider outlives a logout, so a request goes once its user is no longer the one signed in.
  useEffect(() => setSignupUserId((current) => (current === userId ? current : null)), [userId]);
  const openAddFunds = useCallback((nextToken?: UserToken | null) => {
    setDepositToken(nextToken ?? null);
    setSquidOpen(false);
    setAddFundsOpen(true);
  }, []);
  const closeAddFunds = useCallback(() => {
    setSignupUserId(null);
    setAddFundsOpen(false);
  }, []);
  const closeAddFundsForChainChange = useCallback(() => setAddFundsOpen(false), []);
  const openSquid = useCallback(() => {
    setSignupUserId(null);
    setAddFundsOpen(false);
    setSquidOpen(true);
  }, []);
  const closeSquid = useCallback(() => setSquidOpen(false), []);
  const requestFundingAfterSignup = useCallback((nextUserId: string) => setSignupUserId(nextUserId), []);
  const isFundingAfterSignup = signupUserId !== null;
  const value = useMemo(
    () => ({
      closeAddFunds,
      closeAddFundsForChainChange,
      closeSquid,
      depositToken,
      isAddFundsOpen,
      isFundingAfterSignup,
      isSquidOpen,
      openAddFunds,
      openSquid,
      requestFundingAfterSignup,
    }),
    [
      closeAddFunds,
      closeAddFundsForChainChange,
      closeSquid,
      depositToken,
      isAddFundsOpen,
      isFundingAfterSignup,
      isSquidOpen,
      openAddFunds,
      openSquid,
      requestFundingAfterSignup,
    ],
  );
  return <FundingLaunchContext.Provider value={value}>{children}</FundingLaunchContext.Provider>;
}

export function useFundingLaunch() {
  const value = useContext(FundingLaunchContext);
  if (!value) throw new Error("useFundingLaunch must be used within FundingLaunchProvider");
  return value;
}
