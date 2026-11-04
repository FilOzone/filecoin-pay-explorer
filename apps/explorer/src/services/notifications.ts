import { createSiweMessage, generateSiweNonce } from "viem/siwe";

export const NOTIFICATIONS_API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

/** A SIWE message for the notifications API. `statement` must match api/auth.ts SIWE_STATEMENTS exactly. */
export function buildNotificationsSiwe(address: `0x${string}`, chainId: number, statement: string): string {
  return createSiweMessage({
    domain: window.location.host,
    address,
    statement,
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
}

/**
 * POSTs a signed request, turning a failure into a message for the user.
 * `statusMessages` replaces the message for the statuses one route answers differently.
 */
export async function postNotificationsApi(
  path: string,
  body: unknown,
  failureMessage: string,
  statusMessages: Partial<Record<number, string>> = {},
): Promise<void> {
  if (!NOTIFICATIONS_API_URL) throw new Error("Notifications API URL not configured");
  const res = await fetch(`${NOTIFICATIONS_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return;

  const data = await res.json().catch(() => null);
  const statusMessage = statusMessages[res.status];
  if (statusMessage) throw new Error(statusMessage);
  if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
  if (res.status === 400 && data?.error) throw new Error(data.error);
  if (res.status === 401) throw new Error("Signature verification failed. Please try again.");
  throw new Error(data?.error ?? data?.message ?? failureMessage);
}

/** Reads a wallet's record from `path`, rejecting a response `isResponse` doesn't recognise. */
export async function getNotificationsApi<T>(
  path: string,
  walletAddress: string,
  isResponse: (value: unknown) => value is T,
  failureMessage: string,
  signal: AbortSignal,
): Promise<T> {
  const res = await fetch(`${NOTIFICATIONS_API_URL}${path}?wallet=${walletAddress.toLowerCase()}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  });
  if (!res.ok) throw new Error(failureMessage);
  const data: unknown = await res.json();
  if (!isResponse(data)) throw new Error("Unexpected response from notifications API");
  return data;
}
