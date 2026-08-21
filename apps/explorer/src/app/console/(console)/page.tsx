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
import { AccountNotFound, ErrorState, UnsupportedChain } from "@/components/UserConsole/States";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  onGuidedTopUp?: () => void;
  userAddress: string;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({
  account,
  error,
  isLoading,
  onGuidedTopUp,
  userAddress,
  alertsBanner,
}: AccountSectionsProps) => {
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
        <FundsSection account={account} onGuidedTopUp={onGuidedTopUp} />
        {alertsBanner}
      </div>
      <RailsSection account={account} userAddress={userAddress} />
      <OperatorApprovalsSection account={account} />

      {/* A failed background refetch still leaves the last good account on screen. */}
      {error ? <ErrorState error={error} /> : null}
    </>
  );
};

const UserConsole = () => {
  const { address, chainId } = useConnection();
  const walletNetwork = getNetworkFromChainId(chainId);
  const isFilecoinChain = isSupportedChainId(chainId);
  const canLoadFilecoinConsole = chainId === undefined || isFilecoinChain;
  const isSquidSourceChain = !isFilecoinChain && SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(
    canLoadFilecoinConsole ? address : undefined,
  );
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner = isNotificationsEligibleNetwork(walletNetwork) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(canLoadFilecoinConsole ? (address ?? "") : "", {
    networkOverride: walletNetwork,
  });

  if (address && isSquidSourceChain) {
    return (
      <div className='flex flex-col gap-15'>
        <UnsupportedChain />
        <TopUpDialogController accountId={address} key={address} />
      </div>
    );
  }

  const accountSections = address ? (
    <AccountSections
      account={accountQuery.data}
      error={accountQuery.error}
      isLoading={accountQuery.isLoading}
      userAddress={address}
      alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
    />
  ) : null;

  const showTopUpTrigger = !accountQuery.isLoading && !accountQuery.error && !accountQuery.data;

  return (
    <div className='flex flex-col gap-15'>
      {/* The (console) layout gates on a connected wallet, so address is set here. */}
      {address && canLoadFilecoinConsole && walletNetwork === "mainnet" ? (
        <TopUpDialogController
          accountId={accountQuery.data?.id ?? address}
          key={address}
          showTrigger={showTopUpTrigger}
        >
          {(openTopUp) =>
            accountSections && (
              <AccountSections
                account={accountQuery.data}
                error={accountQuery.error}
                isLoading={accountQuery.isLoading}
                onGuidedTopUp={openTopUp}
                userAddress={address}
                alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
              />
            )
          }
        </TopUpDialogController>
      ) : (
        accountSections
      )}
    </div>
  );
};

export default UserConsole;
