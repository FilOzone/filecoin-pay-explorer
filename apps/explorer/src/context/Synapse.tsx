"use client";
import {
  CONTRACT_ADDRESSES,
  PaymentsService,
  PDPVerifier,
  Synapse,
  type UploadResult,
  WarmStorageService,
} from "@filoz/synapse-sdk";
import { createContext, useCallback, useEffect, useState } from "react";
import { useChainId } from "wagmi";
import { useEthersProvider, useEthersSigner } from "@/hooks/useEthersSigner";
import type { SynapseContextType } from "./types";

export const SynapseContext = createContext<SynapseContextType | null>(null);

export const SynapseProvider = ({ children }: { children: React.ReactNode }) => {
  const [synapse, setSynapse] = useState<Synapse | null>(null);
  const [paymentsService, setPaymentsService] = useState<PaymentsService | null>(null);
  const [warmStorageService, setWarmStorageService] = useState<WarmStorageService | null>(null);
  const [pdpVerifier, setPdpVerifier] = useState<PDPVerifier | null>(null);
  const [network, setNetwork] = useState<"calibration" | "mainnet">("calibration");
  const chainId = useChainId();
  const provider = useEthersProvider({ chainId });
  const signer = useEthersSigner({ chainId });

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
      CONTRACT_ADDRESSES.USDFC[network],
      false,
    );
    setPaymentsService(paymentsServiceInstance);
    return paymentsServiceInstance;
  }, [paymentsService, synapse, provider, signer, network]);

  const initializeWarmStorageService = useCallback(async (): Promise<WarmStorageService> => {
    if (warmStorageService) return warmStorageService;

    const warmStorageAddress = synapse?.getWarmStorageAddress();

    const warmStorageServiceInstance = await WarmStorageService.create(provider!, warmStorageAddress!);
    setWarmStorageService(warmStorageServiceInstance);
    return warmStorageServiceInstance;
  }, [warmStorageService, synapse, provider]);

  const initializePDPVerifier = useCallback(async (): Promise<PDPVerifier> => {
    if (pdpVerifier) return pdpVerifier;

    const verifierAddress = synapse?.getPDPVerifierAddress();
    const pdpVerifierInstance = new PDPVerifier(provider!, verifierAddress!);
    setPdpVerifier(pdpVerifierInstance);
    return pdpVerifierInstance;
  }, [pdpVerifier, synapse, provider]);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult | undefined> => {
      if (!synapse) return;

      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const storage = await synapse.createStorage();
        const uploadResult = await storage.upload(fileBuffer.buffer, {
          onUploadComplete: (cid) => {
            console.log("File uploaded successfully:", cid);
          },
          onPieceConfirmed: (pieceIds) => {
            pieceIds.forEach((pieceId) => {
              console.log("Piece confirmed:", pieceId);
            });
          },
        });

        console.log("Upload result:", uploadResult);

        return uploadResult;
      } catch (error) {
        console.error(error);
      }
    },
    [synapse],
  );

  const checkStorageAllowance = useCallback(
    async (sizeInBytes: number, withCDN: boolean) => {
      if (!warmStorageService || !paymentsService) {
        console.log("[SynapseContext] warmStorageService or paymentsService is not initialized");
        return;
      }

      return await warmStorageService.checkAllowanceForStorage(sizeInBytes, withCDN, paymentsService);
    },
    [warmStorageService, paymentsService],
  );

  useEffect(() => {
    if (!provider) return;
    initializeSynapse();

    if (!signer || !synapse) return;
    initializePaymentsService();
    initializeWarmStorageService();
    initializePDPVerifier();
  }, [
    provider,
    signer,
    synapse,
    initializeSynapse,
    initializePDPVerifier,
    initializePaymentsService,
    initializeWarmStorageService,
  ]);

  useEffect(() => {
    switch (chainId) {
      case 314:
        setNetwork("mainnet");
        break;
      case 314159:
        setNetwork("calibration");
        break;
      default:
        setNetwork("calibration");
    }
  }, [chainId]);

  return (
    <SynapseContext.Provider
      value={{
        synapse,
        paymentsService,
        warmStorageService,
        pdpVerifier,
        checkStorageAllowance,
        uploadFile,
      }}
    >
      {children}
    </SynapseContext.Provider>
  );
};
