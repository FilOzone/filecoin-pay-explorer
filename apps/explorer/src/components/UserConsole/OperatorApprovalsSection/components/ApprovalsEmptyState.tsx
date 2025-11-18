import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { Shield } from "lucide-react";
import ApprovalSectionLayout from "./ApprovalSectionLayout";

export type ApprovalsEmptyStateProps = {
  onApprove: () => void;
};

function ApprovalsEmptyState({ onApprove }: ApprovalsEmptyStateProps) {
  return (
    <ApprovalSectionLayout handleOpenApprove={onApprove}>
      <EmptyStateCard
        titleTag='h2'
        title='No authorized services'
        description="You haven't authorized any services yet. Approve a service to let them manage payments on your behalf."
        icon={Shield}
      />
    </ApprovalSectionLayout>
  );
}

export default ApprovalsEmptyState;
