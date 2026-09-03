import type { ConnectedWallet, User } from "@privy-io/react-auth";

type WalletLike = Pick<ConnectedWallet, "address" | "walletClientType">;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const CONSOLE_WALLET_KEY = "filecoin-pay:console-wallet:v1";

export function isPrivyEmbeddedWallet(wallet: Pick<ConnectedWallet, "walletClientType">): boolean {
  return wallet.walletClientType === "privy";
}

/**
 * Chooses which Privy wallet wagmi, and therefore the console, acts as.
 *
 * Privy's wagmi bridge otherwise activates every newly connected wallet, which
 * turned "connect another wallet to fund this account" into "switch accounts".
 * Priority: the embedded wallet, then the wallet the user logged in with, then
 * whatever was active last (remembered in storage so a reload keeps the same
 * identity for connect-only sessions), then the first connected wallet.
 */
export function createConsoleWalletSelector({ storage }: { storage?: () => StorageLike } = {}) {
  let lastAddress: string | undefined;
  const readStored = () => {
    try {
      return storage?.().getItem(CONSOLE_WALLET_KEY) ?? undefined;
    } catch {
      // Storage is a convenience; without it the choice lasts for the session.
      return undefined;
    }
  };
  const remember = (address: string | undefined) => {
    lastAddress = address;
    if (!address) return;
    try {
      storage?.().setItem(CONSOLE_WALLET_KEY, address);
    } catch {
      // Same as above: a failed write only shortens the memory to this session.
    }
  };
  return <T extends WalletLike>({
    wallets,
    user,
  }: {
    wallets: T[];
    user: Pick<User, "wallet"> | null;
  }): T | undefined => {
    const byAddress = (address: string | undefined) =>
      address ? wallets.find((wallet) => wallet.address.toLowerCase() === address.toLowerCase()) : undefined;
    const selected =
      wallets.find(isPrivyEmbeddedWallet) ??
      byAddress(user?.wallet?.address) ??
      byAddress(lastAddress ?? readStored()) ??
      wallets[0];
    remember(selected?.address);
    return selected;
  };
}
