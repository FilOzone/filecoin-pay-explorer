"use client";
import { asClient, Synapse } from "@filoz/synapse-sdk";
import { createContext, useMemo } from "react";
import { useChainId, useConnectorClient } from "wagmi";
import { isSupportedChainId } from "@/utils/network";
import type { SynapseContextType } from "./types";

export const SynapseContext = createContext<SynapseContextType | null>(null);

/**
 * Owns the SDK client for the connected wallet. It follows the wallet's chain, so it carries no contract
 * configuration: that comes from the network the console displays, which during a Squid top-up is mainnet while the
 * wallet sits on the source chain.
 */
export const SynapseProvider = ({ children }: { children: React.ReactNode }) => {
  const chainId = useChainId();
  const { data: client } = useConnectorClient({ chainId });

  const value = useMemo(
    () => ({
      synapse:
        client && isSupportedChainId(chainId)
          ? new Synapse({ client: asClient(client), source: "filecoin-pay-explorer" })
          : null,
    }),
    [chainId, client],
  );

  return <SynapseContext.Provider value={value}>{children}</SynapseContext.Provider>;
};
