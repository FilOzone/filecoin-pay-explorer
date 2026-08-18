"use client";

import { createContext, useCallback, useMemo, useState } from "react";
import type { Network } from "@/types";
import { DEFAULT_NETWORK } from "@/utils/constants";
import { getSubgraphUrl } from "@/utils/network";
import type { NetworkContextType } from "./types";

export const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [network, setNetworkState] = useState<Network>(DEFAULT_NETWORK);
  // Distinguishes an explicit selection (header selector, console switcher,
  // wallet sync) from the initial default, so URL adoption knows who wins.
  const [hasUserSelection, setHasUserSelection] = useState(false);

  const setNetwork = useCallback((value: Network) => {
    setHasUserSelection(true);
    setNetworkState(value);
  }, []);

  // Adopt a network from the URL without claiming user intent: deep links and
  // first loads flow through here and must stay overridable by later URLs.
  const adoptNetwork = useCallback((value: Network) => {
    setNetworkState(value);
  }, []);

  const value = useMemo(
    () => ({ network, setNetwork, adoptNetwork, hasUserSelection, subgraphUrl: getSubgraphUrl(network) }),
    [network, setNetwork, adoptNetwork, hasUserSelection],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};
