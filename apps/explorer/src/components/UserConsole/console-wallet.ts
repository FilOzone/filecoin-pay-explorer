import type { ConnectedWallet, User } from "@privy-io/react-auth";

export function isPrivyEmbeddedWallet(wallet: Pick<ConnectedWallet, "walletClientType">): boolean {
  return wallet.walletClientType === "privy";
}

const EXITED_KEY = "filecoin-pay:console-exited";

/** Records a deliberate exit, so a wallet that can't be disconnected (MetaMask) isn't selected again on reload. */
export function setConsoleExited(exited: boolean) {
  try {
    if (exited) window.localStorage.setItem(EXITED_KEY, "1");
    else window.localStorage.removeItem(EXITED_KEY);
  } catch {
    // Without storage the exit lasts until the page reloads.
  }
}

function hasExited(): boolean {
  try {
    return window.localStorage.getItem(EXITED_KEY) !== null;
  } catch {
    return false;
  }
}

/** The wallet the console follows: the login's embedded wallet, else the extension, and none after an exit. */
export function selectConsoleWallet({ wallets }: { wallets: ConnectedWallet[] }): ConnectedWallet | undefined {
  if (hasExited()) return undefined;
  return wallets.find(isPrivyEmbeddedWallet) ?? wallets[0];
}

/** Whether `address` is one of the Privy user's own wallets. */
export function isLinkedWallet(user: User | null, address: string | undefined): boolean {
  const target = address?.toLowerCase();
  return Boolean(
    target &&
      user?.linkedAccounts.some((account) => account.type === "wallet" && account.address.toLowerCase() === target),
  );
}
