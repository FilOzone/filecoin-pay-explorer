"use client";

import { useLogout, usePrivy } from "@privy-io/react-auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useDisconnect } from "wagmi";

// Caps how long a forced exit hides the console's normal state, in case disconnect or logout never settles.
const EXIT_FALLBACK_MS = 5_000;

type ActiveWalletGuard = {
  /** Allows the next transition to the confirmed address. */
  confirmActive: (address: string) => void;
  /** True while a forced exit is settling, so callers can show a neutral state instead of "preparing". */
  isExiting: boolean;
};

const ActiveWalletGuardContext = createContext<ActiveWalletGuard | null>(null);

// Extension account changes update wagmi in place, so reject addresses the app did not confirm.
export function ActiveWalletGuardProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const lastKnownGoodAddress = useRef<string | undefined>(undefined);
  const [isExiting, setIsExiting] = useState(false);

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
      setIsExiting(true);
      return;
    }
    lastKnownGoodAddress.current = address;
  }, [address, authenticated, disconnect, logout]);

  // wagmi settles before Privy's logout does, so isExiting bridges that gap instead of flashing "preparing".
  useEffect(() => {
    if (isExiting && !isConnected && !authenticated) setIsExiting(false);
  }, [isExiting, isConnected, authenticated]);

  useEffect(() => {
    if (!isExiting) return;
    const timeout = setTimeout(() => setIsExiting(false), EXIT_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, [isExiting]);

  const confirmActive = useCallback((confirmedAddress: string) => {
    lastKnownGoodAddress.current = confirmedAddress;
  }, []);
  const value = useMemo(() => ({ confirmActive, isExiting }), [confirmActive, isExiting]);

  return <ActiveWalletGuardContext.Provider value={value}>{children}</ActiveWalletGuardContext.Provider>;
}

export function useActiveWalletGuard(): ActiveWalletGuard {
  const value = useContext(ActiveWalletGuardContext);
  if (!value) throw new Error("useActiveWalletGuard must be used within ActiveWalletGuardProvider");
  return value;
}
