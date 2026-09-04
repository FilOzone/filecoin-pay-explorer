"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useConnection } from "wagmi";
import {
  AlertsBanner,
  FundsSection,
  OperatorApprovalsSection,
  ServicesSection,
  TopUpDialogController,
} from "@/components/UserConsole";
import { AccountNotFound, ErrorState, UnsupportedChain } from "@/components/UserConsole/States";
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
  onGuidedTopUp?: () => void;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({ account, error, isLoading, network, onGuidedTopUp, alertsBanner }: AccountSectionsProps) => {
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
        <FundsSection account={account} network={network} onGuidedTopUp={onGuidedTopUp} />
        {alertsBanner}
      </div>
      <ServicesSection accountId={account.id} network={network} />
      <OperatorApprovalsSection account={account} network={network} />

      {/* A failed background refetch still leaves the last good account on screen. */}
      {error ? <ErrorState error={error} /> : null}
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

  const accountSections = (onGuidedTopUp?: () => void) =>
    address ? (
      <AccountSections
        account={accountQuery.data}
        error={accountQuery.error}
        isLoading={accountQuery.isLoading}
        network={displayNetwork}
        onGuidedTopUp={onGuidedTopUp}
        alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
      />
    ) : null;

  const showTopUpTrigger = !accountQuery.isLoading && !accountQuery.error && !accountQuery.data;

  return (
    <div className='flex flex-col gap-15'>
      {/* The (console) layout gates on a connected wallet, so address is set here. */}
      {address && canMountTopUpController ? (
        <TopUpDialogController
          accountId={accountQuery.data?.id ?? address}
          key={address}
          showTrigger={isFilecoinMainnet && showTopUpTrigger}
        >
          {(openTopUp, isOpen) => (isSquidSourceChain && !isOpen ? <UnsupportedChain /> : accountSections(openTopUp))}
        </TopUpDialogController>
      ) : canLoadFilecoinConsole ? (
        accountSections()
      ) : null}
    </div>
  );
};

export default UserConsole;
