"use client";

import { createContext, useMemo, useState } from "react";
import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";
import type { NetworkContextType } from "./types";

export const NetworkContext = createContext<NetworkContextType | null>(null);

const NETWORK_STORAGE_KEY = "filecoin-pay-explorer-network";

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [network, setNetworkState] = useState<Network>(() => {
    if (typeof window === "undefined") return "mainnet";

    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    const isValidNetwork = supportedChains.some((chain) => chain.slug === stored);
    if (isValidNetwork) {
      return stored as Network;
    }
    return "mainnet";
  });

  const setNetwork = (newNetwork: Network) => {
    setNetworkState(newNetwork);
    if (typeof window !== "undefined") {
      localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    }
  };

  const subgraphUrl = useMemo(() => {
    const projectId = process.env.NEXT_PUBLIC_GOLDSKY_PROJECT_ID;
    const subgraphNames = {
      mainnet: process.env.NEXT_PUBLIC_GOLDSKY_MAINNET_SUBGRAPH_NAME,
      calibration: process.env.NEXT_PUBLIC_GOLDSKY_CALIBRATION_SUBGRAPH_NAME,
    };
    const subgraphVersions = {
      mainnet: process.env.NEXT_PUBLIC_GOLDSKY_MAINNET_SUBGRAPH_VERSION,
      calibration: process.env.NEXT_PUBLIC_GOLDSKY_CALIBRATION_SUBGRAPH_VERSION,
    };

    return `https://api.goldsky.com/api/public/${projectId}/subgraphs/${subgraphNames[network]}/${subgraphVersions[network]}/gn`;
  }, [network]);

  return <NetworkContext.Provider value={{ network, setNetwork, subgraphUrl }}>{children}</NetworkContext.Provider>;
};
