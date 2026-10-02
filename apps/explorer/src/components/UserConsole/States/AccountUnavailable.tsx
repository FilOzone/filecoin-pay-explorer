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
  const { account } = useConsoleAccount();
  const walletExit = useWalletExit();
  // The console account reconnects on its own once its wallet is back, so success needs no handling.
  const { connectWallet } = useConnectWallet({
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
};

export default AccountUnavailable;
