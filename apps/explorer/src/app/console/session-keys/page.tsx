"use client";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { BetaWarning } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import ConsoleSidebar from "@/components/UserConsole/ConsoleSidebar";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

const SessionKeysContent = () => {
  const { address, isConnected, chainId } = useAccount();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId && !isSupportedChainId(chainId);

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-20 -mt-20'>
        <div className='flex justify-between items-center'>
          <h2 className='text-4xl font-medium'>Filecoin Pay Console</h2>
          {isConnected && <CustomConnectButton />}
        </div>

        <BetaWarning />

        {(!isConnected || !address) && <NotConnected />}

        {isUnsupportedChain && <UnsupportedChain />}

        {isConnected && !isUnsupportedChain && address && (
          <div className='flex gap-12'>
            <ConsoleSidebar />
            <div className='flex-1 min-w-0'>
              <SessionKeysSection network={walletNetwork} account={address} />
            </div>
          </div>
        )}
      </div>
    </PageSection>
  );
};

const SessionKeysPage = () => (
  <ConsoleProviders>
    <SessionKeysContent />
  </ConsoleProviders>
);

export default SessionKeysPage;
