"use client";
import { PaymentsService, Synapse } from "@filoz/synapse-sdk";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { useEthersProvider, useEthersSigner } from "@/hooks/useEthersSigner";
import { supportedChains } from "@/services/wagmi/config";
import { appConstants } from "@/utils/constants";
import type { SynapseContextType } from "./types";

export const SynapseContext = createContext<SynapseContextType | null>(null);

export const SynapseProvider = ({ children }: { children: React.ReactNode }) => {
  const [synapse, setSynapse] = useState<Synapse | null>(null);
  const [paymentsService, setPaymentsService] = useState<PaymentsService | null>(null);
  const chainId = useChainId();
  const provider = useEthersProvider({ chainId });
  const signer = useEthersSigner({ chainId });

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

  const initializePaymentsService = useCallback(async (): Promise<PaymentsService> => {
    if (paymentsService) return paymentsService;

    const paymentsAddress = synapse?.getPaymentsAddress();
    const paymentsServiceInstance = new PaymentsService(
      provider!,
      signer!,
      paymentsAddress!,
      constants.contracts.usdfc,
      false,
    );
    setPaymentsService(paymentsServiceInstance);
    return paymentsServiceInstance;
  }, [paymentsService, synapse, provider, signer, constants]);

  useEffect(() => {
    if (!provider) return;
    initializeSynapse();

    if (!signer || !synapse) return;
    initializePaymentsService();
  }, [provider, signer, synapse, initializeSynapse, initializePaymentsService]);

  return (
    <SynapseContext.Provider
      value={{
        synapse,
        paymentsService,
        constants,
      }}
    >
      {children}
    </SynapseContext.Provider>
  );
};
