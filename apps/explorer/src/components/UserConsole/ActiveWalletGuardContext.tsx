"use client";

import { useLogout, usePrivy } from "@privy-io/react-auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useConnection, useDisconnect } from "wagmi";

type ActiveWalletGuard = {
  /** Allows the next transition to the confirmed address. */
  confirmActive: (address: string) => void;
};

const ActiveWalletGuardContext = createContext<ActiveWalletGuard | null>(null);

// Extension account changes update wagmi in place, so reject addresses the app did not confirm.
export function ActiveWalletGuardProvider({ children }: { children: ReactNode }) {
  const { address } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const lastKnownGoodAddress = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!address) {
      // A disconnected session has no active address to preserve.
      lastKnownGoodAddress.current = undefined;
      return;
    }
    const confirmed = lastKnownGoodAddress.current;
    if (confirmed && confirmed.toLowerCase() !== address.toLowerCase()) {
      // An authenticated session must end fully, or it reads as "preparing" forever, not "not connected".
      if (authenticated) void logout();
      disconnect({});
      lastKnownGoodAddress.current = undefined;
      return;
    }
    lastKnownGoodAddress.current = address;
  }, [address, authenticated, disconnect, logout]);

  const confirmActive = useCallback((confirmedAddress: string) => {
    lastKnownGoodAddress.current = confirmedAddress;
  }, []);
  const value = useMemo(() => ({ confirmActive }), [confirmActive]);

  return <ActiveWalletGuardContext.Provider value={value}>{children}</ActiveWalletGuardContext.Provider>;
}

export function useActiveWalletGuard(): ActiveWalletGuard {
  const value = useContext(ActiveWalletGuardContext);
  if (!value) throw new Error("useActiveWalletGuard must be used within ActiveWalletGuardProvider");
  return value;
}
