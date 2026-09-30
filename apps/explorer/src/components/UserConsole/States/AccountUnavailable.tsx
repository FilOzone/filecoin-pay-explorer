"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { type ConnectedWallet, useConnectWallet, useLogout, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { isUserCancelledFlow } from "@/components/shared/CustomConnectButton/state";
import { useWalletExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { type ConsoleAccount, useConsoleAccount } from "@/components/UserConsole/ConsoleAccountContext";
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
  const { exit } = useWalletExit(replacement);

  const continueWithReplacement = async () => {
    // A Privy login belongs to the account that verified it, so it must end before the new account takes over.
    if (authenticated) {
      try {
        await logout();
      } catch (error) {
        toast.error("Unable to log out", { description: describeError(error) });
        return;
      }
    }
    selectAccount(replacement);
  };

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Your wallet switched accounts'
      description={`Your wallet is now on ${formatAddress(replacement.address)}. The console is still showing ${formatAddress(account.address)}, and nothing was signed from the new account. Switch back in your wallet, or continue with the new account.`}
    >
      <div className='flex flex-col items-center gap-2'>
        <Button variant='primary' type='button' onClick={() => void continueWithReplacement()}>
          Continue as {formatAddress(replacement.address)}
        </Button>
        <LogOutButton exit={exit} />
      </div>
    </EmptyStateCard>
  );
}

function WalletLocked({ account }: { account: ConsoleAccount }) {
  const { exit } = useWalletExit();
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
      title='Your wallet is locked or disconnected'
      description={`Unlock your wallet or reconnect ${formatAddress(account.address)} to continue.`}
    >
      <div className='flex flex-col items-center gap-2'>
        <Button variant='primary' type='button' onClick={() => connectWallet()}>
          Reconnect
        </Button>
        <LogOutButton exit={exit} />
      </div>
    </EmptyStateCard>
  );
}

function LogOutButton({ exit }: { exit: () => Promise<void> }) {
  return (
    <Button
      variant='ghost'
      size='compact'
      type='button'
      onClick={() =>
        void exit().catch((error: unknown) => toast.error("Unable to log out", { description: describeError(error) }))
      }
    >
      Log out
    </Button>
  );
}

export default AccountUnavailable;
