"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BaseError, UserRejectedRequestError } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

async function callMuteDataset(body: { message: string; signature: string; dataSetId: string }): Promise<void> {
  if (!API_URL) throw new Error("Notifications API URL not configured");
  const res = await fetch(`${API_URL}/mute-dataset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
    if (res.status === 400 && data?.error) throw new Error(data.error);
    if (res.status === 401) throw new Error("Signature verification failed. Please try again.");
    throw new Error(data?.error ?? data?.message ?? "Failed to mute this dataset. Please try again.");
  }
}

// Statement must match api/auth.ts SIWE_STATEMENTS.muteDataset exactly.
function buildMuteSiweMessage(address: `0x${string}`, chainId: number, dataSetId: string): string {
  return createSiweMessage({
    domain: window.location.host,
    address,
    statement: `Mute inactivity alerts for Filecoin Pay dataset ${dataSetId}`,
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
}

// wagmi/viem usually wraps the rejection, so walk the cause chain rather than
// matching the top-level error.
export function isUserRejection(err: unknown): boolean {
  return err instanceof BaseError && Boolean(err.walk((e) => e instanceof UserRejectedRequestError));
}

/**
 * Mutes inactivity alerts for one dataset: signs a dataset-scoped SIWE
 * message and posts it, then invalidates the muted-datasets query so the
 * triage queue drops the row without a manual refetch.
 */
export function useMuteDataSet(accountId: string) {
  const { address, chainId } = useConnection();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dataSetId: string) => {
      if (!address || !chainId) throw new Error("Wallet not connected");
      const message = buildMuteSiweMessage(address, chainId, dataSetId);
      const signature = await signMessageAsync({ message });
      await callMuteDataset({ message, signature, dataSetId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["muted-datasets", accountId] });
    },
  });
}
