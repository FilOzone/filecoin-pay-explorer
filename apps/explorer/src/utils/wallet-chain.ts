import { type Hex, hexToNumber, numberToHex } from "viem";

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

type ChainProvider = {
  request(
    args: { method: "eth_chainId" } | { method: "wallet_switchEthereumChain"; params: [{ chainId: Hex }] },
  ): Promise<unknown>;
};

type WaitOptions = {
  timeoutMs?: number;
  /** Overridable for tests. */
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Resolves once the wallet's provider reports `chainId`, or after `timeoutMs`.
 *
 * Privy's embedded wallet resolves `switchChain` before its provider answers
 * `eth_chainId` with the new chain, so a request issued straight afterwards
 * can still see the old network and fail the "network changed" guard.
 *
 * Returns `true` when the chain matched, `false` on timeout.
 */
export async function waitForWalletChain(
  provider: ChainProvider,
  chainId: number,
  { timeoutMs = DEFAULT_TIMEOUT_MS, sleep = defaultSleep }: WaitOptions = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const reported = await provider.request({ method: "eth_chainId" }).catch(() => undefined);
    if (parseChainId(reported) === chainId) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL_INTERVAL_MS);
  }
}

function parseChainId(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  if (/^0x[0-9a-fA-F]+$/.test(value)) return hexToNumber(value as Hex);
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * Makes sure the provider is on `chainId` before it is asked to sign: reads the
 * chain, and if it differs asks the provider itself to switch, then waits.
 *
 * Privy's `wallet.switchChain` updates the wallet object it publishes on a later
 * render; a provider created from the wallet object the dialog already holds
 * keeps the old chain, so the switch has to be repeated on that provider.
 */
export async function ensureWalletChain(provider: ChainProvider, chainId: number, options: WaitOptions = {}) {
  if (await waitForWalletChain(provider, chainId, { ...options, timeoutMs: 0 })) return true;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(chainId) }] });
  } catch {
    // Some providers switch and reject at the same time, or refuse; the wait below is the verdict.
  }
  return waitForWalletChain(provider, chainId, options);
}
