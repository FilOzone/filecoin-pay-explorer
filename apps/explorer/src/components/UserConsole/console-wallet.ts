import type { ConnectedWallet } from "@privy-io/react-auth";

export function isPrivyEmbeddedWallet(wallet: Pick<ConnectedWallet, "walletClientType">): boolean {
  return wallet.walletClientType === "privy";
}
