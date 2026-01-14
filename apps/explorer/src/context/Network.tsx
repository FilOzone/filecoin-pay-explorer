"use client";

import { createContext, useMemo, useState } from "react";
import type { Network } from "@/types";
import { getSubgraphUrl } from "@/utils/network";
import type { NetworkContextType } from "./types";

export const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [network, setNetwork] = useState<Network>("mainnet");

  const subgraphUrl = useMemo(() => getSubgraphUrl(network), [network]);

  return <NetworkContext.Provider value={{ network, setNetwork, subgraphUrl }}>{children}</NetworkContext.Provider>;
};
