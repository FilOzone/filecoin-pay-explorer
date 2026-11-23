"use client";

import { createContext, useMemo, useState } from "react";
import type { Network } from "@/types";
import { DEFAULT_NETWORK } from "@/utils/constants";
import { getSubgraphUrl } from "@/utils/network";
import type { NetworkContextType } from "./types";

export const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [network, setNetwork] = useState<Network>(DEFAULT_NETWORK);

  const value = useMemo(
    () => ({
      network,
      setNetwork,
      // Standalone pages use the network for navigation without querying a subgraph.
      get subgraphUrl() {
        return getSubgraphUrl(network);
      },
    }),
    [network],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};
