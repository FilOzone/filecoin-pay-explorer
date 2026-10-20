"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useConnection } from "wagmi";
import { AlertsBanner, FundsSection, OperatorApprovalsSection, ServicesSection } from "@/components/UserConsole";
import { useTopUpActivity } from "@/components/UserConsole/providers/TopUpActivityContext";
import { AccountNotFound, ErrorState, UnsupportedChain } from "@/components/UserConsole/States";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import type { Network } from "@/types";
import { isNotificationsEligibleNetwork } from "@/utils/network";

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  network: Network;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({ account, error, isLoading, network, alertsBanner }: AccountSectionsProps) => {
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
        {error ? <ErrorState error={error} /> : <AccountNotFound network={network} />}
        {alertsBanner}
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-6'>
        <FundsSection account={account} network={network} />
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
  const { network, isFilecoinChain, isSquidSourceChain } = useConsoleNetwork();
  const canLoadFilecoinConsole = chainId === undefined || isFilecoinChain || (isTopUpActive && isSquidSourceChain);

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(
    canLoadFilecoinConsole ? address : undefined,
  );
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner = isNotificationsEligibleNetwork(network) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(canLoadFilecoinConsole ? (address ?? "") : "", {
    networkOverride: network,
  });

  const accountSections = () =>
    address ? (
      <AccountSections
        account={accountQuery.data}
        error={accountQuery.error}
        isLoading={accountQuery.isLoading}
        network={network}
        alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
      />
    ) : null;

  return (
    <div className='flex flex-col gap-15'>
      {isSquidSourceChain && !isTopUpActive ? <UnsupportedChain /> : canLoadFilecoinConsole ? accountSections() : null}
    </div>
  );
};

export default UserConsole;
