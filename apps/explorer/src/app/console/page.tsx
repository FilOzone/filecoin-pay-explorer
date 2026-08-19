"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { Balance, ChainSwitcher } from "@/components/shared";
import {
  AlertsBanner,
  BetaWarning,
  FundsSection,
  OperatorApprovalsSection,
  RailsSection,
} from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { AccountNotFound, ErrorState, NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

const UserConsoleContent = () => {
  const { address, isConnected, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isSquidSourceChain = SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);
  const consoleView =
    !isConnected || !address
      ? "disconnected"
      : chainId === undefined
        ? "pending"
        : isSupportedChainId(chainId)
          ? "filecoin"
          : "unsupported";

  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);

  const { data: notificationStatus, isError: notificationStatusError } = useNotificationStatus(address);
  const subscribed = notificationStatus?.subscribed ?? false;

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
              {consoleView === "unsupported" ? (
                <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
                  <AlertTriangle className='size-4' />
                  Unsupported Network
                </span>
              ) : consoleView === "filecoin" ? (
                <>
                  <Balance />
                  {chainId && <ChainSwitcher chainId={chainId} />}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* Beta Warning */}
        <BetaWarning />

        {/* Alerts Banner — hidden once subscribed */}
        {consoleView === "filecoin" && isNotificationsEligible && !subscribed && !notificationStatusError && (
          <div className='-mt-12'>
            <AlertsBanner />
          </div>
        )}

        {/* Not Connected */}
        {consoleView === "disconnected" && <NotConnected />}

        {/* Wallet Network Pending */}
        {consoleView === "pending" && <LoadingStateCard message='Loading your wallet network...' />}

        {/* Unsupported Chain */}
        {consoleView === "unsupported" && <UnsupportedChain />}

        {consoleView === "filecoin" && address && (
          <>
            {/* Loading */}
            {isLoading && <LoadingStateCard message='Loading your account details...' />}

            {/* Account Not Found */}
            {!isError && !isLoading && !account && <AccountNotFound />}
          </>
        )}

        {address &&
          ((consoleView === "filecoin" && !isLoading && !isError && (account || walletNetwork === "mainnet")) ||
            (consoleView === "unsupported" && isSquidSourceChain)) && (
            <FundsSection
              accountId={account?.id ?? address}
              contentHidden={consoleView === "unsupported"}
              key={address}
              subscribed={subscribed}
              topUpOnly={!account || consoleView === "unsupported"}
            />
          )}

        {consoleView === "filecoin" && address && !isLoading && account && (
          <>
            <RailsSection account={account} userAddress={address} />
            <OperatorApprovalsSection account={account} />
          </>
        )}

        {/* Error */}
        {consoleView === "filecoin" && isError && <ErrorState error={error} />}
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
