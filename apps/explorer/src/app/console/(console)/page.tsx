"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useConnection } from "wagmi";
import {
  AlertsBanner,
  FundsSection,
  OperatorApprovalsSection,
  RailsSection,
  TopUpDialogController,
} from "@/components/UserConsole";
import { AccountNotFound, ErrorState, StaleDataNotice, UnsupportedChain } from "@/components/UserConsole/States";
import { useTopUpActivity } from "@/components/UserConsole/TopUpActivityContext";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import type { Network } from "@/types";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  network: Network;
  userAddress: string;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({ account, error, isLoading, network, userAddress, alertsBanner }: AccountSectionsProps) => {
  if (isLoading) {
    return (
      <>
        <LoadingStateCard message='Loading your account details...' />
        {alertsBanner}
      </>
    );
  }

  if (!account) {
    return (
      <>
        {error ? <ErrorState error={error} /> : <AccountNotFound />}
        {alertsBanner}
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-6'>
        {/* A failed background refetch still leaves the last good account on screen. */}
        {error ? <StaleDataNotice error={error} /> : null}
        <FundsSection account={account} network={network} />
        {alertsBanner}
      </div>
      <RailsSection account={account} network={network} userAddress={userAddress} />
      <OperatorApprovalsSection account={account} network={network} />
    </>
  );
};

const UserConsole = () => {
  const { address, chainId } = useConnection();
  const { isTopUpActive } = useTopUpActivity();
  const walletNetwork = getNetworkFromChainId(chainId);
  const isFilecoinChain = isSupportedChainId(chainId);
  const isSquidSourceChain = !isFilecoinChain && SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);
  const isFilecoinMainnet = (chainId === undefined || isFilecoinChain) && walletNetwork === "mainnet";
  const displayMainnetDuringTopUp = isTopUpActive && isSquidSourceChain;
  const displayNetwork = displayMainnetDuringTopUp ? "mainnet" : walletNetwork;
  const canLoadFilecoinConsole = chainId === undefined || isFilecoinChain || displayMainnetDuringTopUp;
  const canMountTopUpController = isFilecoinMainnet || isSquidSourceChain;

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(
    canLoadFilecoinConsole ? address : undefined,
  );
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner =
    isNotificationsEligibleNetwork(displayNetwork) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(canLoadFilecoinConsole ? (address ?? "") : "", {
    networkOverride: displayNetwork,
  });

  const accountSections = () =>
    address ? (
      <AccountSections
        account={accountQuery.data}
        error={accountQuery.error}
        isLoading={accountQuery.isLoading}
        network={displayNetwork}
        userAddress={address}
        alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
      />
    ) : null;

  return (
    <div className='flex flex-col gap-15'>
      {/* The (console) layout gates on a connected wallet, so address is set here. */}
      {address && canMountTopUpController ? (
        <TopUpDialogController accountId={accountQuery.data?.id ?? address} key={address}>
          {(_openTopUp, isOpen) => (isSquidSourceChain && !isOpen ? <UnsupportedChain /> : accountSections())}
        </TopUpDialogController>
      ) : canLoadFilecoinConsole ? (
        accountSections()
      ) : null}
    </div>
  );
};

export default UserConsole;
