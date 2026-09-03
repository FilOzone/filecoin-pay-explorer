import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { CustomConnectButton } from "@/components/shared";

const NotConnected = () => {
  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Access the Filecoin Pay console'
      description='Log in or connect a wallet to manage your deposits, payment rails and services.'
    >
      <CustomConnectButton />
    </EmptyStateCard>
  );
};

export default NotConnected;
