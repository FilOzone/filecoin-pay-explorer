import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

async function fetchNotificationStatus(walletAddress: string): Promise<{ subscribed: boolean }> {
  const res = await fetch(`${API_URL}/status?wallet=${walletAddress.toLowerCase()}`);
  if (!res.ok) throw new Error("Failed to fetch notification status");
  return res.json();
}

export function useNotificationStatus(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["notification-status", walletAddress],
    queryFn: () => fetchNotificationStatus(walletAddress as string),
    enabled: !!walletAddress && !!API_URL,
    staleTime: 30_000,
    retry: false,
  });
}
