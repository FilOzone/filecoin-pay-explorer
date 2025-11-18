import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import ApprovalSectionLayout from "./ApprovalSectionLayout";

interface ApprovalsLoadingStateProps {
  onApprove: () => void;
}

function ApprovalsLoadingState({ onApprove }: ApprovalsLoadingStateProps) {
  return (
    <ApprovalSectionLayout handleOpenApprove={onApprove}>
      <LoadingStateCard message='Loading authorized services...' />
    </ApprovalSectionLayout>
  );
}

export default ApprovalsLoadingState;
