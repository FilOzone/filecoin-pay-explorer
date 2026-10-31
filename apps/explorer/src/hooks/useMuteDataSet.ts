"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useSignMessage } from "wagmi";
import { buildNotificationsSiwe, postNotificationsApi } from "@/services/notifications";

type MuteRequest = { dataSetId: string; mutedUntil: number };

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
      const until = new Date(mute.mutedUntil * 1000).toISOString();
      const message = buildNotificationsSiwe(
        address,
        chainId,
        `Mute inactivity alerts for Filecoin Pay dataset ${mute.dataSetId} until ${until}`,
      );
      const signature = await signMessageAsync({ message });
      await postNotificationsApi(
        "/mute-dataset",
        { ...mute, message, signature },
        "Failed to mute this dataset. Please try again.",
        // Only mutedUntil can fail validation for a request built here, and it fails when the device clock is off.
        { 422: "This date was rejected. Check that your device clock is correct and try again." },
      );
    },
    // Returning the refetch keeps the mutation pending until the row is gone,
    // so Keep can't be clicked again in between.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["muted-datasets", accountId] }),
  });
}
