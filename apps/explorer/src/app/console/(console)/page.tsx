"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useConnection } from "wagmi";
import { AlertsBanner, FundsSection, OperatorApprovalsSection, RailsSection } from "@/components/UserConsole";
import { AccountNotFound, ErrorState } from "@/components/UserConsole/States";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  userAddress: string;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({ account, error, isLoading, userAddress, alertsBanner }: AccountSectionsProps) => {
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
        <FundsSection account={account} />
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

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(address);
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner = isNotificationsEligibleNetwork(walletNetwork) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(address ?? "", { networkOverride: walletNetwork });

  return (
    <div className='flex flex-col gap-15'>
      {/* The (console) layout gates on a connected wallet, so address is set here. */}
      {address ? (
        <AccountSections
          account={accountQuery.data}
          error={accountQuery.error}
          isLoading={accountQuery.isLoading}
          userAddress={address}
          alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
        />
      ) : null}
    </div>
  );
};

export default UserConsole;
