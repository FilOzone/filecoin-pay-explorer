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

const FT_TYPES = new Set(["direct", "organic", "referral", "campaign"]);
const PRODUCTS = ["agent-skills", "ipfs-pinning", "data-storage", "backups-archives", "pricing", "dev-quickstart"];
// Untrusted URL input: a slug (dots allowed for source domains) with no long hex run,
// so addresses, hashes, and UUIDs can't pass as labels.
const LABEL = /^[a-z0-9.-]{1,64}$/;
const HEX_RUN = /[0-9a-f]{8,}/;

const asLabel = (value: string | null | undefined) =>
  value && LABEL.test(value) && !HEX_RUN.test(value) ? value : null;

const entryType = (ref: string | null) => {
  if (!ref) return "console-direct";
  return ref.startsWith("docs-") ? "from-docs" : "from-site";
};

// The CTA's product (foc_ref is `<product>-<cta>`), else the landing page's, else the CLI's.
const productOf = (ref: string | null, entry: string | null, params: URLSearchParams) => {
  const fromRef = PRODUCTS.find((product) => ref?.startsWith(`${product}-`));
  if (fromRef) return fromRef;
  if (entry && PRODUCTS.includes(entry)) return entry;
  return params.get("utm_source") === "filecoin-pin" ? "filecoin-pin" : null;
};

/**
 * Wire format, set by the website's link decorator:
 * `foc_ft=<ft_type>[:<ft_source>]` (e.g. `organic:google`, `referral:news.ycombinator.com`),
 * `foc_entry=<landing page slug>`, `foc_ref=<product>-<cta>`.
 */
export function readFunnelLabels(params: URLSearchParams): FunnelProps {
  const ref = asLabel(params.get("foc_ref"));
  const entry = asLabel(params.get("foc_entry"));
  const [ftType, ftSource] = (params.get("foc_ft") ?? "").split(":", 2);
  const known = FT_TYPES.has(ftType);
  const source = known ? asLabel(ftSource) : null;
  const product = productOf(ref, entry, params);
  return {
    ft_type: known ? ftType : "direct",
    entry_page: entry ?? "console",
    entry_type: entryType(ref),
    ...(source ? { ft_source: source } : {}),
    ...(ref ? { foc_ref: ref } : {}),
    ...(product ? { product } : {}),
  };
}

// foc_* stays in the URL like utm_*, so a reload or the Google login redirect reads it again.
// ponytail: client navigation drops the query, so a reload on another console page reads as console-direct.
let labels: FunnelProps | null = null;
const fired = new Set<string>();

/** The first labels read this page load win, so later URL changes can't re-attribute a visit. */
const funnelLabels = () => {
  labels ??= readFunnelLabels(new URLSearchParams(window.location.search));
  return labels;
};

function trackFunnelEvent(event: string, revenue?: string, extra?: FunnelProps) {
  window.plausible?.(event, {
    props: { ...funnelLabels(), ...extra },
    ...(revenue && { revenue: { currency: "USD", amount: revenue } }),
  });
}

export function trackConsoleView() {
  if (fired.has("console_view")) return;
  fired.add("console_view");
  trackFunnelEvent("console_view");
}

/** A login or connect the user just did, never a silent reconnect. `new` marks a first-time account. */
export function trackWalletConnected(walletType: "embedded" | "external", isNewUser = false) {
  trackFunnelEvent("console_wallet_connected", undefined, {
    wallet_type: walletType,
    account: isNewUser ? "new" : "returning",
  });
}

/** Mainnet USDFC only: the funnel's "added money". */
export function trackDepositConfirmed(chainId: number, token: Address, amount: bigint) {
  if (chainId !== mainnet.id || token.toLowerCase() !== mainnet.contracts.usdfc.address.toLowerCase()) return;
  trackFunnelEvent("console_deposit_confirmed", formatUnits(amount, 18));
}
