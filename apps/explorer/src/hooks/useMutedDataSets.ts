import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

type DataSetMute = { dataSetId: string; mutedUntil: number };

function isDataSetMute(value: unknown): value is DataSetMute {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).dataSetId === "string" &&
    typeof (value as Record<string, unknown>).mutedUntil === "number"
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

async function fetchMutedDataSets(walletAddress: string, signal: AbortSignal): Promise<DataSetMute[]> {
  const res = await fetch(`${API_URL}/muted-datasets?wallet=${walletAddress.toLowerCase()}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  });
  if (!res.ok) throw new Error("Failed to fetch muted datasets");
  const data: unknown = await res.json();
  if (!isMutedDataSetsResponse(data)) throw new Error("Unexpected response from notifications API");
  return data.mutes;
}

/** The dataset ids whose mute is still in effect, as a lookup set. The API leaves out expired mutes. */
export function useMutedDataSets(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["muted-datasets", walletAddress],
    queryFn: ({ signal }) => fetchMutedDataSets(walletAddress as string, signal),
    select: (mutes) => new Set(mutes.map((mute) => mute.dataSetId)),
    enabled: !!walletAddress && !!API_URL,
    staleTime: 30_000,
    retry: false,
  });
}
