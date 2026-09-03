"use client";

import type { UserToken } from "@filecoin-pay/types";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type FundingLaunch = {
  depositToken: UserToken | null;
  isAddFundsOpen: boolean;
  openAddFunds: (depositToken?: UserToken | null) => void;
  closeAddFunds: () => void;
};
const FundingLaunchContext = createContext<FundingLaunch | null>(null);

export function FundingLaunchProvider({ children }: { children: ReactNode }) {
  const [isAddFundsOpen, setAddFundsOpen] = useState(false);
  const [depositToken, setDepositToken] = useState<UserToken | null>(null);
  const openAddFunds = useCallback((nextToken?: UserToken | null) => {
    setDepositToken(nextToken ?? null);
    setAddFundsOpen(true);
  }, []);
  const closeAddFunds = useCallback(() => setAddFundsOpen(false), []);
  const value = useMemo(
    () => ({ closeAddFunds, depositToken, isAddFundsOpen, openAddFunds }),
    [closeAddFunds, depositToken, isAddFundsOpen, openAddFunds],
  );
  return <FundingLaunchContext.Provider value={value}>{children}</FundingLaunchContext.Provider>;
}

export function useFundingLaunch() {
  const value = useContext(FundingLaunchContext);
  if (!value) throw new Error("useFundingLaunch must be used within FundingLaunchProvider");
  return value;
}
