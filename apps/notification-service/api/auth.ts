import { verifyMessage } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

export const SIWE_STATEMENTS = {
  subscribe: (email: string) => `Subscribe to Filecoin Pay notifications for ${email}`,
  unsubscribe: "Unsubscribe from Filecoin Pay notifications",
} as const;

export type SiweVerifyResult = { ok: true; walletAddress: string } | { ok: false; error: string };

interface SiweVerifyParams {
  message: string;
  signature: string;
  domain: string;
  chainId: number;
  expectedStatement: string;
}

export async function verifySiwe({
  message,
  signature,
  domain,
  chainId,
  expectedStatement,
}: SiweVerifyParams): Promise<SiweVerifyResult> {
  let parsed: ReturnType<typeof parseSiweMessage>;

  try {
    parsed = parseSiweMessage(message);
  } catch {
    return { ok: false, error: "Invalid SIWE message format" };
  }

  if (!parsed.address) {
    return { ok: false, error: "Missing address in SIWE message" };
  }

  if (!parsed.issuedAt) {
    return { ok: false, error: "Missing issuedAt in SIWE message" };
  }

  const issuedAtMs = new Date(parsed.issuedAt).getTime();

  if (Number.isNaN(issuedAtMs)) {
    return { ok: false, error: "Invalid issuedAt format in SIWE message" };
  }

  const age = Date.now() - issuedAtMs;
  if (age < 0 || age > FRESHNESS_WINDOW_MS) {
    return { ok: false, error: "SIWE message expired or issued in the future" };
  }

  if (parsed.statement !== expectedStatement) {
    return { ok: false, error: "SIWE statement mismatch" };
  }

  if (!validateSiweMessage({ message: parsed, domain })) {
    return { ok: false, error: "SIWE domain mismatch" };
  }

  if (parsed.chainId !== chainId) {
    return { ok: false, error: `SIWE chainId mismatch: expected ${chainId}, got ${parsed.chainId}` };
  }

  try {
    const valid = await verifyMessage({
      address: parsed.address,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return { ok: false, error: "Invalid signature" };
    }
  } catch {
    return { ok: false, error: "Signature verification failed" };
  }

  return { ok: true, walletAddress: parsed.address };
}
