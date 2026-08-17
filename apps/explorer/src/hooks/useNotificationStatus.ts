import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

function isStatusResponse(value: unknown): value is { subscribed: boolean } {
  return (
    typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).subscribed === "boolean"
  );
}

async function fetchNotificationStatus(walletAddress: string, signal: AbortSignal): Promise<{ subscribed: boolean }> {
  const res = await fetch(`${API_URL}/status?wallet=${walletAddress.toLowerCase()}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  });
  if (!res.ok) throw new Error("Failed to fetch notification status");
  const data: unknown = await res.json();
  if (!isStatusResponse(data)) throw new Error("Unexpected response from notifications API");
  return data;
}

export function useNotificationStatus(
  walletAddress: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ["notification-status", walletAddress],
    queryFn: ({ signal }) => fetchNotificationStatus(walletAddress as string, signal),
    enabled: !!walletAddress && !!API_URL,
    staleTime: 30_000,
    retry: false,
    refetchInterval: options?.refetchInterval ?? false,
  });
}
