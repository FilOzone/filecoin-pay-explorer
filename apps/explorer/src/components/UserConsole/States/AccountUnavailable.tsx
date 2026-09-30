"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { type ConnectedWallet, useConnectWallet, useLogout, usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { toast } from "sonner";
import {
  isUserCancelledFlow,
  WALLET_EXIT_LABEL,
  type WalletExitAction,
} from "@/components/shared/CustomConnectButton/state";
import { useWalletExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { type ConsoleAccount, useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { formatAddress } from "@/utils/formatter";

const describeError = (error: unknown) => (error instanceof Error ? error.message : undefined);

// Shown when the console account's wallet is gone: the extension switched accounts, locked, or disconnected.
const AccountUnavailable = () => {
  const { account } = useConsoleAccount();
  const { wallets } = useWallets();
  if (!account) return null;
  // An extension exposes one account at a time, so its current account replaces the missing one.
  const replacement = wallets.find((wallet) => wallet.walletClientType === account.walletClientType);
  return replacement ? (
    <WalletSwitched account={account} replacement={replacement} />
  ) : (
    <WalletLocked account={account} />
  );
};

function WalletSwitched({ account, replacement }: { account: ConsoleAccount; replacement: ConnectedWallet }) {
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const { selectAccount } = useConsoleAccount();
  const walletExit = useWalletExit(replacement);
  const [isSwitching, setIsSwitching] = useState(false);

  const continueWithReplacement = async () => {
    setIsSwitching(true);
    // A Privy login belongs to the account that verified it, so it must end before the new account takes over.
    if (authenticated) {
      try {
        await logout();
      } catch (error) {
        toast.error("Unable to log out", { description: describeError(error) });
        setIsSwitching(false);
        return;
      }
    }
    selectAccount(replacement);
  };

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Your wallet is using a different account'
      description={`Filecoin Pay is open for ${formatAddress(account.address)}, but your wallet is currently using ${formatAddress(replacement.address)}. To keep using ${formatAddress(account.address)}, switch back in your wallet.`}
    >
      <div className='flex flex-col items-center gap-2'>
        <Button
          variant='primary'
          size='compact'
          type='button'
          disabled={isSwitching}
          onClick={() => void continueWithReplacement()}
        >
          {isSwitching ? "Switching account…" : `Use ${formatAddress(replacement.address)}`}
        </Button>
        <ExitLink action={walletExit.action} exit={walletExit.exit} />
      </div>
    </EmptyStateCard>
  );
}

function WalletLocked({ account }: { account: ConsoleAccount }) {
  const walletExit = useWalletExit();
  // The console account reconnects on its own once its wallet is back, so success needs no handling.
  const { connectWallet } = useConnectWallet({
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to connect wallet", { description: code });
    },
  });

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Reconnect your wallet'
      description={`Unlock your wallet or reconnect ${formatAddress(account.address)} to continue.`}
    >
      <div className='flex flex-col items-center gap-2'>
        <Button variant='primary' size='compact' type='button' onClick={() => connectWallet()}>
          Reconnect wallet
        </Button>
        <ExitLink action={walletExit.action} exit={walletExit.exit} />
      </div>
    </EmptyStateCard>
  );
}

function ExitLink({ action, exit }: { action: WalletExitAction; exit: () => Promise<void> }) {
  const [isExiting, setIsExiting] = useState(false);
  const pendingLabel = action === "logout" ? "Logging out…" : "Disconnecting…";

  const handleExit = async () => {
    setIsExiting(true);
    try {
      await exit();
    } catch (error) {
      setIsExiting(false);
      toast.error(action === "logout" ? "Unable to log out" : "Unable to disconnect wallet", {
        description: describeError(error),
      });
    }
  };

  return (
    <button
      className='text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50'
      type='button'
      disabled={isExiting}
      onClick={() => void handleExit()}
    >
      {isExiting ? pendingLabel : WALLET_EXIT_LABEL[action]}
    </button>
  );
}

export default AccountUnavailable;
