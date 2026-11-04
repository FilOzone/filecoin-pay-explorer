import { useQuery } from "@tanstack/react-query";
import { getNotificationsApi, NOTIFICATIONS_API_URL } from "@/services/notifications";

function isStatusResponse(value: unknown): value is { subscribed: boolean } {
  return (
    typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).subscribed === "boolean"
  );
}

export function useNotificationStatus(
  walletAddress: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ["notification-status", walletAddress],
    queryFn: ({ signal }) =>
      getNotificationsApi(
        "/status",
        walletAddress as string,
        isStatusResponse,
        "Failed to fetch notification status",
        signal,
      ),
    enabled: !!walletAddress && !!NOTIFICATIONS_API_URL,
    staleTime: 30_000,
    retry: false,
    refetchInterval: options?.refetchInterval ?? false,
  });
}
