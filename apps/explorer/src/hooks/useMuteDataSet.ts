"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

type MuteRequest = { dataSetId: string; mutedUntil: number };

async function callMuteDataset(body: MuteRequest & { message: string; signature: string }): Promise<void> {
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
function buildMuteSiweMessage(address: `0x${string}`, chainId: number, { dataSetId, mutedUntil }: MuteRequest): string {
  const until = new Date(mutedUntil * 1000).toISOString();
  return createSiweMessage({
    domain: window.location.host,
    address,
    statement: `Mute inactivity alerts for Filecoin Pay dataset ${dataSetId} until ${until}`,
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
}

/**
 * Mutes inactivity alerts for one dataset until `mutedUntil` (unix seconds):
 * signs a SIWE message naming the dataset and end date, posts it, then
 * refetches the muted datasets so the triage queue drops the row.
 */
export function useMuteDataSet(accountId: string) {
  const { address, chainId } = useConnection();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mute: MuteRequest) => {
      if (!address || !chainId) throw new Error("Wallet not connected");
      const message = buildMuteSiweMessage(address, chainId, mute);
      const signature = await signMessageAsync({ message });
      await callMuteDataset({ ...mute, message, signature });
    },
    // Returning the refetch keeps the mutation pending until the row is gone,
    // so Keep can't be clicked again in between.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["muted-datasets", accountId] }),
  });
}
