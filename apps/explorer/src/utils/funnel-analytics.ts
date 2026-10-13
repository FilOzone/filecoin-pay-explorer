/**
 * Plausible funnel events for the console: console_view → console_wallet_connected →
 * console_deposit_confirmed. Labels only: never a wallet address, visitor ID, or a hash of either.
 * Plausible attaches the session's utm_* to these events itself.
 */

import { type Address, formatUnits } from "viem";
import { mainnet } from "@/constants/chains";
import { dropSearchParams } from "@/hooks/useConsumedSearchParams";

type FunnelProps = Record<string, string>;

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: FunnelProps; revenue?: { currency: string; amount: string } },
    ) => void;
  }
}

// foc_jid is never read; it is dropped so a visitor ID can't linger in the URL.
const FUNNEL_PARAMS = ["foc_ft", "foc_entry", "foc_ref", "foc_jid"] as const;
const FT_TYPES = new Set(["direct", "organic", "referral", "campaign"]);
// Untrusted URL input: a slug with no long hex run, so addresses, hashes, and UUIDs can't pass as labels.
const SLUG = /^[a-z0-9-]{1,64}$/;
const HEX_RUN = /[0-9a-f]{8,}/;

const readLabel = (params: URLSearchParams, name: string) => {
  const value = params.get(name);
  return value && SLUG.test(value) && !HEX_RUN.test(value) ? value : null;
};

const entryType = (ref: string | null) => {
  if (!ref) return "console-direct";
  return ref.startsWith("docs-") ? "from-docs" : "from-site";
};

export function readFunnelLabels(params: URLSearchParams): FunnelProps {
  const ref = readLabel(params, "foc_ref");
  const ftType = params.get("foc_ft");
  return {
    ft_type: ftType && FT_TYPES.has(ftType) ? ftType : "direct",
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
  labels = readFunnelLabels(new URLSearchParams(window.location.search));
  dropSearchParams(FUNNEL_PARAMS);
}

function trackFunnelEvent(event: string, revenue?: string) {
  window.plausible?.(event, {
    props: labels ?? readFunnelLabels(new URLSearchParams()),
    ...(revenue && { revenue: { currency: "USD", amount: revenue } }),
  });
}

/** console_wallet_connected counts connected sessions, auto-reconnects included, not first-time signups. */
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
