"use client";
import { asClient, Synapse } from "@filoz/synapse-sdk";
import { createContext, useEffect, useMemo, useState } from "react";
import { useChainId, useConnectorClient } from "wagmi";
import { supportedChains } from "@/services/wagmi/config";
import { appConstants } from "@/utils/constants";
import type { SynapseContextType } from "./types";

export const SynapseContext = createContext<SynapseContextType | null>(null);

export const SynapseProvider = ({ children }: { children: React.ReactNode }) => {
  const [synapse, setSynapse] = useState<Synapse | null>(null);
  const chainId = useChainId();
  const { data: client } = useConnectorClient({ chainId });

  const constants = useMemo(() => {
    const effectiveChainId = chainId ?? supportedChains[0].id;
    return (
      appConstants[effectiveChainId as (typeof supportedChains)[number]["id"]] ?? appConstants[supportedChains[0].id]
    );
  }, [chainId]);

  useEffect(() => {
    if (!client) {
      setSynapse(null);
      return;
    }
    setSynapse(new Synapse({ client: asClient(client), source: null }));
  }, [client]);

  return (
    <SynapseContext.Provider
      value={{
        synapse,
        constants,
      }}
    >
      {children}
    </SynapseContext.Provider>
  );
};
