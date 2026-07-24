import { z } from "zod";

const VERIFY_PREFIX = "verify:";
const PENDING_TTL_SECONDS = 24 * 60 * 60;

// Internal schema — token is stored alongside the payload so a new registration
// for the same wallet overwrites the key and invalidates the previous token.
const storedSchema = z.object({
  token: z.string().min(1),
  email: z.string().min(1),
  preferredName: z.string().min(1),
});

export type PendingVerification = {
  email: string;
  preferredName: string;
};

// walletAddress must be pre-normalized to lowercase by the caller.
export async function writePendingVerification(
  kv: KVNamespace,
  walletAddress: string,
  data: { token: string; email: string; preferredName: string },
): Promise<void> {
  await kv.put(`${VERIFY_PREFIX}${walletAddress}`, JSON.stringify(data), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

// Returns email+preferredName if the token matches; null for all failure cases
// (missing wallet, token mismatch, malformed KV) — callers surface a generic 404.
export async function readPendingVerification(
  kv: KVNamespace,
  walletAddress: string,
  token: string,
): Promise<PendingVerification | null> {
  const raw = await kv.get(`${VERIFY_PREFIX}${walletAddress}`);
  if (!raw) return null;
  try {
    const result = storedSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    if (result.data.token !== token) return null;
    return { email: result.data.email, preferredName: result.data.preferredName };
  } catch {
    return null;
  }
}

export async function deletePendingVerification(kv: KVNamespace, walletAddress: string): Promise<void> {
  await kv.delete(`${VERIFY_PREFIX}${walletAddress}`);
}
