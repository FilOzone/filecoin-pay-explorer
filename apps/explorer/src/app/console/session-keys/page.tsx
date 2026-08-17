"use client";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { BetaWarning } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import ConsoleSidebar from "@/components/UserConsole/ConsoleSidebar";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { parseAuthorizeParam } from "@/utils/authorizeParam";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

const SessionKeysContent = () => {
  const { address, isConnected, chainId } = useAccount();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId && !isSupportedChainId(chainId);

  // The `?authorize=` param comes from the filecoin-pin CLI pairing flow.
  // Capture it ONCE on load into state so it survives the wallet-connect
  // step, then strip it from the URL — the address bar shouldn't keep
  // replaying an old authorization request across refreshes and shares.
  const [prefillAddress, setPrefillAddress] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("authorize")) return;
    setPrefillAddress(parseAuthorizeParam(params.get("authorize")));
    params.delete("authorize");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

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
              <SessionKeysSection network={walletNetwork} account={address} prefillAddress={prefillAddress} />
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
