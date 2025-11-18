import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { CustomConnectButton } from "@/components/shared";

const NotConnected = () => {
  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Access the Filecoin Pay console'
      description='Connect your wallet to access the Filecoin Pay console and manage your payment rails, deposits, and authorized services.'
    >
      <CustomConnectButton />
    </EmptyStateCard>
  );
};

export default NotConnected;
