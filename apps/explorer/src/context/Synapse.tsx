"use client";
import { Synapse } from "@filoz/synapse-sdk";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { useEthersProvider } from "@/hooks/useEthersSigner";
import { supportedChains } from "@/services/wagmi/config";
import { appConstants } from "@/utils/constants";
import type { SynapseContextType } from "./types";

export const SynapseContext = createContext<SynapseContextType | null>(null);

export const SynapseProvider = ({ children }: { children: React.ReactNode }) => {
  const [synapse, setSynapse] = useState<Synapse | null>(null);
  const chainId = useChainId();
  const provider = useEthersProvider({ chainId });

  const constants = useMemo(() => {
    const effectiveChainId = chainId ?? supportedChains[0].id;
    return (
      appConstants[effectiveChainId as (typeof supportedChains)[number]["id"]] ?? appConstants[supportedChains[0].id]
    );
  }, [chainId]);

  const initializeSynapse = useCallback(async (): Promise<Synapse> => {
    if (synapse) return synapse;

    const synapseInstance = await Synapse.create({
      provider,
    });
    setSynapse(synapseInstance);
    return synapseInstance;
  }, [synapse, provider]);

  useEffect(() => {
    if (!provider) return;
    initializeSynapse();
  }, [provider, initializeSynapse]);

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
