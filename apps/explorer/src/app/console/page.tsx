"use client";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { AlertsBanner, FundsSection, RailsSection } from "@/components/UserConsole";
import ConsoleAccountGate from "@/components/UserConsole/ConsoleAccountGate";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

const DashboardPage = () => {
  const { address, isConnected, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId !== undefined && !isSupportedChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);

  const { data: notificationStatus, isError: notificationStatusError } = useNotificationStatus(address);
  const subscribed = notificationStatus?.subscribed ?? false;

  return (
    <div className='flex flex-col gap-15'>
      {/* Alerts Banner — hidden once subscribed */}
      {isConnected && !isUnsupportedChain && isNotificationsEligible && !subscribed && !notificationStatusError && (
        <AlertsBanner />
      )}

      <ConsoleAccountGate>
        {({ account, address: connectedAddress }) => (
          <>
            <FundsSection account={account} subscribed={subscribed} />
            <RailsSection account={account} userAddress={connectedAddress} />
          </>
        )}
      </ConsoleAccountGate>
    </div>
  );
};

export default DashboardPage;
