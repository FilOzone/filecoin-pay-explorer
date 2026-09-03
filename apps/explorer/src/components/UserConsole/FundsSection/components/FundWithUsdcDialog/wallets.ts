import type { ConnectedWallet } from "@privy-io/react-auth";
import { formatUnits } from "viem";
import { isPrivyEmbeddedWallet } from "@/components/UserConsole/console-wallet";
import { formatAddress } from "@/utils/formatter";

// Gas amounts are small, so they get the same four decimals as the top-up offer.
export const NATIVE_FRACTION_DIGITS = 4;

export function describeWallet(wallet: Pick<ConnectedWallet, "address" | "walletClientType">): string {
  const name = isPrivyEmbeddedWallet(wallet)
    ? "Privy wallet"
    : wallet.walletClientType.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
  return `${name} (${formatAddress(wallet.address)})`;
}

/** The embedded wallet pays by default; otherwise the first connected wallet. */
export function pickDefaultWallet(wallets: readonly ConnectedWallet[]): ConnectedWallet | undefined {
  return wallets.find(isPrivyEmbeddedWallet) ?? wallets[0];
}

export function formatTokenAmount(amount: bigint, decimals: number, maxFractionDigits = 2): string {
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  const trimmed = fraction.replace(/0+$/, "").slice(0, maxFractionDigits);
  return trimmed ? `${whole}.${trimmed}` : whole;
}
