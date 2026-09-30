"use client";

import {
  type ConnectedWallet,
  type LinkedAccountWithMetadata,
  type User,
  usePrivy,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";
import { isAddress } from "viem";
import { config } from "@/services/wagmi/config";

/** The account the console shows and signs for. */
export type ConsoleAccount = { address: string; walletClientType: string };

type ConsoleAccountContextValue = {
  account: ConsoleAccount | null;
  selectAccount: (wallet: Pick<ConnectedWallet, "address" | "walletClientType">) => void;
  clearAccount: () => void;
};

const ConsoleAccountContext = createContext<ConsoleAccountContextValue | null>(null);

const CONSOLE_ACCOUNT_KEY = "filecoin-pay:console-account:v1";

function isConsoleAccount(value: unknown): value is ConsoleAccount {
  if (typeof value !== "object" || value === null) return false;
  const { address, walletClientType } = value as Record<string, unknown>;
  return typeof address === "string" && isAddress(address) && typeof walletClientType === "string";
}

function readStoredAccount(): ConsoleAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(CONSOLE_ACCOUNT_KEY) ?? "null");
    return isConsoleAccount(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeAccount(account: ConsoleAccount | null) {
  try {
    if (account) window.localStorage.setItem(CONSOLE_ACCOUNT_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(CONSOLE_ACCOUNT_KEY);
  } catch {
    // Without storage the account lasts until the page reloads.
  }
}

const isEmbeddedWalletAccount = (account: LinkedAccountWithMetadata): account is WalletWithMetadata =>
  account.type === "wallet" && account.walletClientType === "privy";

// A Privy login implies its account: the embedded wallet, or else the wallet the user verified with.
function getSessionAccount(user: User | null): ConsoleAccount | null {
  const wallet = user?.linkedAccounts.find(isEmbeddedWalletAccount) ?? user?.wallet;
  return wallet ? { address: wallet.address, walletClientType: wallet.walletClientType ?? "" } : null;
}

/**
 * Owns the console account and the wagmi connection that follows it. Only the gate, "Use account",
 * and exits change the account; logging in, verifying, or connecting another wallet never does.
 */
export function ConsoleAccountProvider({ children }: { children: ReactNode }) {
  const { user } = usePrivy();
  const [storedAccount, setStoredAccount] = useState(readStoredAccount);
  const sessionAccount = useMemo(() => getSessionAccount(user), [user]);
  const account = storedAccount ?? sessionAccount;

  const selectAccount = useCallback((wallet: Pick<ConnectedWallet, "address" | "walletClientType">) => {
    const next = { address: wallet.address, walletClientType: wallet.walletClientType };
    storeAccount(next);
    setStoredAccount(next);
  }, []);
  const clearAccount = useCallback(() => {
    storeAccount(null);
    setStoredAccount(null);
  }, []);

  const accountAddress = account?.address.toLowerCase();
  // wagmi holds only the console account, so every other wallet stays in Privy for paying.
  const selectWalletForWagmi = useCallback(
    ({ wallets }: { wallets: ConnectedWallet[] }) =>
      wallets.find((wallet) => wallet.address.toLowerCase() === accountAddress),
    [accountAddress],
  );
  const value = useMemo(() => ({ account, selectAccount, clearAccount }), [account, selectAccount, clearAccount]);

  return (
    <ConsoleAccountContext value={value}>
      <WagmiProvider config={config} setActiveWalletForWagmi={selectWalletForWagmi}>
        {children}
      </WagmiProvider>
    </ConsoleAccountContext>
  );
}

export function useConsoleAccount(): ConsoleAccountContextValue {
  const value = use(ConsoleAccountContext);
  if (!value) throw new Error("useConsoleAccount must be used within ConsoleAccountProvider");
  return value;
}
