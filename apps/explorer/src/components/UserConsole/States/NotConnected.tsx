import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { CustomConnectButton } from "@/components/shared";
import { getWalletEntryState } from "@/components/shared/CustomConnectButton/state";

const NotConnected = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const walletEntryState = getWalletEntryState({ ready, walletsReady, authenticated });

  if (!error && walletEntryState === "loading") return <LoadingStateCard message='Loading wallet...' />;

  const isPreparing = !error && walletEntryState === "preparing";

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title={isPreparing ? "Preparing your wallet" : "Open your Filecoin Pay account"}
      description={
        isPreparing
          ? "You're signed in. We're connecting your wallet to Filecoin Pay."
          : "Manage your payment rails, deposits, and authorized services."
      }
    >
      <CustomConnectButton />
    </EmptyStateCard>
  );
};

export default NotConnected;
