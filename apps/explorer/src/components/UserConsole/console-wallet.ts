import type { ConnectedWallet, User } from "@privy-io/react-auth";

export function isPrivyEmbeddedWallet(wallet: Pick<ConnectedWallet, "walletClientType">): boolean {
  return wallet.walletClientType === "privy";
}

/** Whether `address` is one of the Privy user's own wallets. */
export function isLinkedWallet(user: User | null, address: string | undefined): boolean {
  const target = address?.toLowerCase();
  return Boolean(
    target &&
      user?.linkedAccounts.some((account) => account.type === "wallet" && account.address.toLowerCase() === target),
  );
}
