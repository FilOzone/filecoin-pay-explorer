import { type Hex, hexToNumber, numberToHex } from "viem";

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;
const TIMED_OUT = Symbol("timed-out");

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

async function requestBefore(provider: ChainProvider, args: Parameters<ChainProvider["request"]>[0], deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return TIMED_OUT;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.request(args).catch(() => undefined),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timeout = setTimeout(() => resolve(TIMED_OUT), remaining);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function waitUntilWalletChain(
  provider: ChainProvider,
  chainId: number,
  deadline: number,
  sleep: (milliseconds: number) => Promise<void>,
) {
  for (;;) {
    const reported = await requestBefore(provider, { method: "eth_chainId" }, deadline);
    if (reported === TIMED_OUT) return false;
    if (parseChainId(reported) === chainId) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

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
  return waitUntilWalletChain(provider, chainId, deadline, sleep);
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
  const { timeoutMs = DEFAULT_TIMEOUT_MS, sleep = defaultSleep } = options;
  const deadline = Date.now() + timeoutMs;
  const reported = await requestBefore(provider, { method: "eth_chainId" }, deadline);
  if (reported === TIMED_OUT) return false;
  if (parseChainId(reported) === chainId) return true;

  const switched = await requestBefore(
    provider,
    { method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(chainId) }] },
    deadline,
  );
  if (switched === TIMED_OUT) return false;
  // Some providers switch and reject at the same time, or refuse; the wait below is the verdict.
  return waitUntilWalletChain(provider, chainId, deadline, sleep);
}
