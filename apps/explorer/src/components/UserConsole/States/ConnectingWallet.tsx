"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useConsoleAccountExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { ExitLink } from "./ExitLink";

// Connecting takes a moment; past this the wallet connection has likely failed, so the user needs a way out.
const SLOW_CONNECTION_MS = 10_000;

const ConnectingWallet = () => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsSlow(true), SLOW_CONNECTION_MS);
    return () => clearTimeout(timeout);
  }, []);

  return isSlow ? <SlowConnection /> : <LoadingStateCard message='Connecting your wallet...' />;
};

function SlowConnection() {
  const { account } = useConsoleAccount();
  const walletExit = useConsoleAccountExit();

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Still connecting your wallet'
      description='This is taking longer than usual. Reload the page to try again.'
    >
      <div className='flex flex-col items-center gap-2'>
        <Button variant='primary' size='compact' type='button' onClick={() => window.location.reload()}>
          Reload
        </Button>
        {account ? <ExitLink action={walletExit.action} exit={walletExit.exit} /> : null}
      </div>
    </EmptyStateCard>
  );
}

export default ConnectingWallet;
