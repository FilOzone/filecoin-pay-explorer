import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import FundsSectionLayout from "./FundsSectionLayout";

/**
 * Each state keeps the section heading and its Deposit action, so the reader can
 * still add funds while the balances are loading or failing to load.
 */
type FundsStateProps = {
  onDeposit: () => void;
};

export function FundsLoadingState({ onDeposit }: FundsStateProps) {
  return (
    <FundsSectionLayout handleOpenDeposit={onDeposit}>
      <LoadingStateCard message='Loading funds...' />
    </FundsSectionLayout>
  );
}

export function FundsErrorState({ onDeposit }: FundsStateProps) {
  return (
    <FundsSectionLayout handleOpenDeposit={onDeposit}>
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load funds'
        description='Unable to fetch your token balances. Please try again.'
        IconComponent={AlertCircle}
      />
    </FundsSectionLayout>
  );
}

export function FundsEmptyState({ onDeposit }: FundsStateProps) {
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
