import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useConnection } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { getWalletEntryState } from "@/components/shared/CustomConnectButton/state";

const NotConnected = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { isConnected } = useConnection();
  const walletEntryState = getWalletEntryState({ ready, walletsReady, authenticated, isConnected });

  if (!error && walletEntryState === "loading") return <LoadingStateCard message='Loading wallet...' />;

  const isPreparing = !error && walletEntryState === "preparing";

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title={isPreparing ? "Preparing your wallet" : "Access the Filecoin Pay console"}
      description={
        isPreparing
          ? "You're signed in. We're connecting your wallet to Filecoin Pay."
          : "Connect your wallet to access the Filecoin Pay console and manage your payment rails, deposits, and authorized services."
      }
    >
      <CustomConnectButton />
    </EmptyStateCard>
  );
};

export default NotConnected;
