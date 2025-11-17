import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { AlertCircle } from "lucide-react";
import FundsSectionLayout from "./FundsSectionLayout";

export type FundsErrorStateProps = {
  onDeposit: () => void;
};

function FundsErrorState({ onDeposit }: FundsErrorStateProps) {
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

export default FundsErrorState;
