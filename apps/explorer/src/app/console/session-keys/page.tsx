"use client";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { BetaWarning } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { ConsoleLayout } from "@/components/UserConsole/ConsoleSidebar";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

const SessionKeysContent = () => {
  const { address, isConnected, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId && !isSupportedChainId(chainId);

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-15 -mt-25 sm:mt-0'>
        <div className='flex flex-col gap-15 sm:flex-row sm:gap-6 sm:items-center sm:justify-between'>
          <h2 className='font-heading text-balance text-3xl/10 font-medium sm:text-5xl/15 sm:tracking-tight'>
            Filecoin Pay Console
          </h2>
          {isConnected && (
            <div className='order-first w-full sm:order-last sm:w-auto'>
              <CustomConnectButton />
            </div>
          )}
        </div>

        <BetaWarning />

        {(!isConnected || !address) && <NotConnected />}

        {isUnsupportedChain && <UnsupportedChain />}

        {isConnected && !isUnsupportedChain && address && (
          <ConsoleLayout>
            <SessionKeysSection network={walletNetwork} account={address} />
          </ConsoleLayout>
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
