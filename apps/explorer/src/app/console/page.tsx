"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { Balance, ChainSwitcher } from "@/components/shared";
import { BetaWarning, FundsSection, OperatorApprovalsSection, RailsSection } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { AccountNotFound, ErrorState, NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { formatAddress } from "@/utils/formatter";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

const UserConsoleContent = () => {
  const { address, isConnected, chainId } = useAccount();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const externalSquidSourceChain = SQUID_SOURCE_CHAINS.find((chain) => chain.id === chainId);
  const consoleView =
    !isConnected || !address
      ? "disconnected"
      : isSupportedChainId(chainId)
        ? "filecoin"
        : externalSquidSourceChain
          ? "squid-source"
          : "unsupported";

  const {
    data: account,
    isLoading,
    isError,
    error,
  } = useAccountDetails(address || "", { networkOverride: walletNetwork });

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-15 -mt-25 sm:mt-0'>
        <div className='flex flex-col gap-15 sm:flex-row sm:gap-6 sm:items-center sm:justify-between'>
          <h2 className='font-heading text-balance text-3xl/10 font-medium sm:text-5xl/15 sm:tracking-tight'>
            Filecoin Pay Console
          </h2>
          {isConnected && (
            <div className='order-first w-full flex flex-col-reverse gap-2 sm:order-last sm:w-auto sm:flex-row sm:items-center sm:gap-4'>
              {consoleView === "squid-source" ? (
                <span className='inline-flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm'>
                  <span>{externalSquidSourceChain?.name}</span>
                  {address && <span className='font-mono text-zinc-600'>{formatAddress(address)}</span>}
                </span>
              ) : consoleView === "unsupported" ? (
                <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
                  <AlertTriangle className='size-4' />
                  Unsupported Network
                </span>
              ) : (
                <>
                  <Balance />
                  {chainId && <ChainSwitcher chainId={chainId} />}
                </>
              )}
            </div>
          )}
        </div>

        {/* Beta Warning */}
        <BetaWarning />

        {/* Not Connected */}
        {consoleView === "disconnected" && <NotConnected />}

        {/* Unsupported Chain */}
        {consoleView === "unsupported" && <UnsupportedChain />}

        {consoleView === "squid-source" && address && <FundsSection accountId={account?.id ?? address} topUpOnly />}

        {consoleView === "filecoin" && address && (
          <>
            {/* Loading */}
            {isLoading && <LoadingStateCard message='Loading your account details...' />}

            {/* Account Not Found */}
            {!isError && !isLoading && !account && (
              <>
                <AccountNotFound />
                {walletNetwork === "mainnet" && <FundsSection accountId={address} topUpOnly />}
              </>
            )}

            {!isLoading && account && (
              <>
                <FundsSection accountId={account.id} />
                <RailsSection account={account} userAddress={address} />
                <OperatorApprovalsSection account={account} />
              </>
            )}

            {/* Error */}
            {isError && <ErrorState error={error} />}
          </>
        )}
      </div>
    </PageSection>
  );
};

const UserConsole = () => {
  return (
    <ConsoleProviders>
      <UserConsoleContent />
    </ConsoleProviders>
  );
};

export default UserConsole;
