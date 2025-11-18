import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import FundsSectionLayout from "./FundsSectionLayout";

interface FundsLoadingStateProps {
  onDeposit: () => void;
}

function FundsLoadingState({ onDeposit }: FundsLoadingStateProps) {
  return (
    <FundsSectionLayout handleOpenDeposit={onDeposit}>
      <LoadingStateCard message='Loading funds...' />
    </FundsSectionLayout>
  );
}

export default FundsLoadingState;
