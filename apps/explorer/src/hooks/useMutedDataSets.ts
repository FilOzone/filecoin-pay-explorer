import { useQuery } from "@tanstack/react-query";
import { getNotificationsApi, NOTIFICATIONS_API_URL } from "@/services/notifications";

type DataSetMute = { dataSetId: string };

function isDataSetMute(value: unknown): value is DataSetMute {
  return (
    typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).dataSetId === "string"
  );
}

function isMutedDataSetsResponse(value: unknown): value is { mutes: DataSetMute[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).mutes) &&
    (value as { mutes: unknown[] }).mutes.every(isDataSetMute)
  );
}

// Module-level so the Set is rebuilt only when the mutes change, not on every render.
const toIdSet = (mutes: DataSetMute[]) => new Set(mutes.map((mute) => mute.dataSetId));

/** The dataset ids whose mute is still in effect, as a lookup set. The API leaves out expired mutes. */
export function useMutedDataSets(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["muted-datasets", walletAddress],
    queryFn: async ({ signal }) => {
      const data = await getNotificationsApi(
        "/muted-datasets",
        walletAddress as string,
        isMutedDataSetsResponse,
        "Failed to fetch muted datasets",
        signal,
      );
      return data.mutes;
    },
    select: toIdSet,
    enabled: !!walletAddress && !!NOTIFICATIONS_API_URL,
    staleTime: 30_000,
    retry: false,
  });
}
