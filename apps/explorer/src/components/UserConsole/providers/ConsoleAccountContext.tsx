"use client";

import {
  type ConnectedWallet,
  type LinkedAccountWithMetadata,
  type User,
  usePrivy,
  useWallets,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useSetActiveWallet, WagmiProvider } from "@privy-io/wagmi";
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";
import { useConnection } from "wagmi";
import { isLinkedWallet } from "@/components/UserConsole/console-wallet";
import { config } from "@/services/wagmi/config";
import { formatAddress } from "@/utils/formatter";

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
 * Owns the console account and the wagmi connection that follows it. Only the gate, the account's own
 * extension switching accounts, and exits change it; logging in, verifying, or connecting another wallet never does.
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
        <KeepConsoleWallet />
        {children}
      </WagmiProvider>
    </ConsoleAccountContext>
  );
}

// Keeps the console account in step with its wallet and ends a Privy login that no longer owns the account.
function KeepConsoleWallet() {
  const { account, selectAccount } = useConsoleAccount();
  const { wallets } = useWallets();
  const { authenticated, user, logout } = usePrivy();
  const { address } = useConnection();
  const { setActiveWallet } = useSetActiveWallet();

  const accountAddress = account?.address.toLowerCase();
  const accountWallet = wallets.find((wallet) => wallet.address.toLowerCase() === accountAddress);
  // A reconnect that started before the account changed can land after it, so wagmi is put back on the account.
  useEffect(() => {
    if (accountWallet && address && address.toLowerCase() !== accountWallet.address.toLowerCase()) {
      void setActiveWallet(accountWallet);
    }
  }, [accountWallet, address, setActiveWallet]);

  // An extension exposes one account at a time, so its current account replaces the missing one.
  // An embedded wallet can't switch accounts, so it is never replaced.
  const replacement =
    account && account.walletClientType !== "privy" && !accountWallet
      ? wallets.find((wallet) => wallet.walletClientType === account.walletClientType)
      : undefined;
  useEffect(() => {
    if (!replacement) return;
    selectAccount(replacement);
    // Anything open for the previous account closes, so say why.
    toast.info(`Switched to ${formatAddress(replacement.address)}`, {
      description: "Your wallet changed accounts.",
    });
  }, [replacement, selectAccount]);

  const walletOnlyLogin = user?.linkedAccounts.every((linked) => linked.type === "wallet") ?? false;
  useEffect(() => {
    if (authenticated && walletOnlyLogin && account && !isLinkedWallet(user, account.address)) void logout();
  }, [authenticated, walletOnlyLogin, user, account, logout]);

  return null;
}

export function useConsoleAccount(): ConsoleAccountContextValue {
  const value = use(ConsoleAccountContext);
  if (!value) throw new Error("useConsoleAccount must be used within ConsoleAccountProvider");
  return value;
}
