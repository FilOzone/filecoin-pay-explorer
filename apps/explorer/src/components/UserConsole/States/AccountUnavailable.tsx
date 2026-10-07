"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { useConnectWallet } from "@privy-io/react-auth";
import { toast } from "sonner";
import { isUserCancelledFlow } from "@/components/shared/CustomConnectButton/state";
import { useWalletExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { formatAddress } from "@/utils/formatter";
import { ExitLink } from "./ExitLink";

// Shown when the console account's wallet exposes no account: it locked or disconnected.
const AccountUnavailable = () => {
  const { account, selectAccount } = useConsoleAccount();
  const walletExit = useWalletExit();
  // Privy offers every wallet here, so the one the user picks becomes the console account, as at the gate.
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => selectAccount(wallet),
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to connect wallet", { description: code });
    },
  });
  if (!account) return null;

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Reconnect your wallet'
      description={`Unlock your wallet to continue with ${formatAddress(account.address)}, or connect a different wallet.`}
    >
      <div className='flex flex-col items-center gap-2'>
        <Button variant='primary' size='compact' type='button' onClick={() => connectWallet()}>
          Connect a wallet
        </Button>
        <ExitLink action={walletExit.action} exit={walletExit.exit} />
      </div>
    </EmptyStateCard>
  );
};

export default AccountUnavailable;
