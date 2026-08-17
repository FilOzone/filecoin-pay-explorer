"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { AlertsBanner, FundsSection, RailsSection } from "@/components/UserConsole";
import { AccountNotFound, ErrorState } from "@/components/UserConsole/States";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";

const DashboardPage = () => {
  const { address, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const {
    data: account,
    isLoading,
    isError,
    error,
  } = useAccountDetails(address || "", {
    networkOverride: walletNetwork,
  });
  const { data: notificationStatus, isError: notificationStatusError } = useNotificationStatus(address);
  const subscribed = notificationStatus?.subscribed ?? false;
  const showAlertsBanner = isNotificationsEligibleNetwork(walletNetwork) && !subscribed && !notificationStatusError;

  if (!address) return null;
  if (isLoading) return <LoadingStateCard message='Loading your account details...' />;
  if (isError) return <ErrorState error={error} />;
  if (!account) return <AccountNotFound />;

  return (
    <>
      <div className='flex flex-col gap-6'>
        <FundsSection account={account} />
        {showAlertsBanner && <AlertsBanner />}
      </div>
      <RailsSection account={account} userAddress={address} />
    </>
  );
};

export default DashboardPage;
