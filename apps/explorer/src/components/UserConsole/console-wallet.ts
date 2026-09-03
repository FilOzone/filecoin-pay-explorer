import type { ConnectedWallet, User } from "@privy-io/react-auth";

type WalletLike = Pick<ConnectedWallet, "address" | "walletClientType">;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const CONSOLE_WALLET_KEY = "filecoin-pay:console-wallet:v1";
const CONSOLE_WALLET_PAUSED_KEY = "filecoin-pay:console-wallet-paused:v1";

export function isPrivyEmbeddedWallet(wallet: Pick<ConnectedWallet, "walletClientType">): boolean {
  return wallet.walletClientType === "privy";
}

export function createConsoleWalletSelector({ storage }: { storage?: () => StorageLike } = {}) {
  let lastAddress: string | undefined;
  let paused: boolean | undefined;
  const readStored = () => {
    try {
      return storage?.().getItem(CONSOLE_WALLET_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const remember = (address: string | undefined) => {
    lastAddress = address;
    if (!address) return;
    try {
      storage?.().setItem(CONSOLE_WALLET_KEY, address);
    } catch {
      // Storage is optional; session memory still preserves the active account.
    }
  };
  const isPaused = () => {
    if (paused === undefined) {
      try {
        paused = storage?.().getItem(CONSOLE_WALLET_PAUSED_KEY) === "1";
      } catch {
        paused = false;
      }
    }
    return paused;
  };
  const setPaused = (value: boolean) => {
    paused = value;
    if (value) lastAddress = undefined;
    try {
      storage?.().setItem(CONSOLE_WALLET_PAUSED_KEY, value ? "1" : "0");
    } catch {
      // Storage is optional; session memory still blocks automatic reselection.
    }
  };
  const select = <T extends WalletLike>({
    wallets,
    user,
  }: {
    wallets: T[];
    user: Pick<User, "wallet"> | null;
  }): T | undefined => {
    if (!user && isPaused()) return undefined;
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

  return Object.assign(select, {
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  });
}

export const consoleWalletSelector = createConsoleWalletSelector({
  storage: () => window.localStorage,
});
