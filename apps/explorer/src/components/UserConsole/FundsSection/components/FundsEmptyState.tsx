import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import FundsSectionLayout from "./FundsSectionLayout";

export type FundsEmptyStateProps = {
  onDeposit: () => void;
};

function FundsEmptyState({ onDeposit }: FundsEmptyStateProps) {
  return (
    <FundsSectionLayout handleOpenDeposit={onDeposit}>
      <EmptyStateCard
        titleTag='h2'
        title='No tokens yet'
        description="You haven't deposited any tokens yet. Deposit tokens to start using Filecoin Pay."
        icon={WalletIcon}
      />
    </FundsSectionLayout>
  );
}

export default FundsEmptyState;
