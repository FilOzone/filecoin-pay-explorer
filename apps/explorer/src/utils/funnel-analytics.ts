/**
 * Plausible funnel events for the console: console_view → console_wallet_connected →
 * console_deposit_confirmed. Labels only: never a wallet address, visitor ID, or a hash of either.
 * Plausible attaches the session's utm_* to these events itself.
 */

import { type Address, formatUnits } from "viem";
import { mainnet } from "@/constants/chains";

type FunnelProps = Record<string, string>;

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: FunnelProps; revenue?: { currency: string; amount: string } },
    ) => void;
  }
}

// Untrusted URL input: a slug or nothing, so an ID can't ride in on a label.
const LABEL = /^[a-z0-9-]{1,64}$/;
const readLabel = (params: URLSearchParams, name: string) => {
  const value = params.get(name);
  return value && LABEL.test(value) ? value : null;
};

const entryType = (ref: string | null) => {
  if (!ref) return "console-direct";
  return ref.startsWith("docs-") ? "from-docs" : "from-site";
};

export function readFunnelLabels(params: URLSearchParams): FunnelProps {
  const ref = readLabel(params, "foc_ref");
  return {
    ft_type: readLabel(params, "foc_ft") ?? "direct",
    entry_page: readLabel(params, "foc_entry") ?? "console",
    entry_type: entryType(ref),
    ...(ref ? { foc_ref: ref } : {}),
  };
}

// ponytail: page memory only, so a reload reads as console-direct; sessionStorage needs the privacy review.
let labels: FunnelProps | null = null;
const fired = new Set<string>();

/** Reads the foc_* labels once per page load, then drops them from the address bar. */
export function captureFunnelLabels() {
  if (labels) return;
  const url = new URL(window.location.href);
  labels = readFunnelLabels(url.searchParams);
  const focKeys = [...url.searchParams.keys()].filter((key) => key.startsWith("foc_"));
  if (focKeys.length === 0) return;
  for (const key of focKeys) url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
}

function trackFunnelEvent(event: string, revenue?: string) {
  window.plausible?.(event, {
    props: labels ?? readFunnelLabels(new URLSearchParams()),
    ...(revenue === undefined ? {} : { revenue: { currency: "USD", amount: revenue } }),
  });
}

export function trackFunnelOnce(event: "console_view" | "console_wallet_connected") {
  if (fired.has(event)) return;
  fired.add(event);
  trackFunnelEvent(event);
}

/** Mainnet USDFC only: the funnel's "added money". */
export function trackDepositConfirmed(chainId: number, token: Address, amount: bigint) {
  if (chainId !== mainnet.id || token.toLowerCase() !== mainnet.contracts.usdfc.address.toLowerCase()) return;
  trackFunnelEvent("console_deposit_confirmed", formatUnits(amount, 18));
}
