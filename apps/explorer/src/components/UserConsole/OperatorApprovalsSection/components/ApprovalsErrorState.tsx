import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { AlertCircle } from "lucide-react";
import ApprovalSectionLayout from "./ApprovalSectionLayout";

interface ApprovalsErrorStateProps {
  onApprove: () => void;
}

function ApprovalsErrorState({ onApprove }: ApprovalsErrorStateProps) {
  return (
    <ApprovalSectionLayout handleOpenApprove={onApprove}>
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load authorized services'
        description='Unable to fetch your authorized services. Please try again.'
        IconComponent={AlertCircle}
      />
    </ApprovalSectionLayout>
  );
}

export default ApprovalsErrorState;
