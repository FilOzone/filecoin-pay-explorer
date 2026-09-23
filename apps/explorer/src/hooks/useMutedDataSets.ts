import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

function isMutedDataSetsResponse(value: unknown): value is { dataSetIds: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).dataSetIds) &&
    (value as { dataSetIds: unknown[] }).dataSetIds.every((id) => typeof id === "string")
  );
}

async function fetchMutedDataSets(walletAddress: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API_URL}/muted-datasets?wallet=${walletAddress.toLowerCase()}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  });
  if (!res.ok) throw new Error("Failed to fetch muted datasets");
  const data: unknown = await res.json();
  if (!isMutedDataSetsResponse(data)) throw new Error("Unexpected response from notifications API");
  return data.dataSetIds;
}

/** The dataset ids this wallet has muted inactivity alerts for, as a lookup set. */
export function useMutedDataSets(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["muted-datasets", walletAddress],
    queryFn: ({ signal }) => fetchMutedDataSets(walletAddress as string, signal),
    select: (dataSetIds) => new Set(dataSetIds),
    enabled: !!walletAddress && !!API_URL,
    staleTime: 30_000,
    retry: false,
  });
}
