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
        title='No services yet'
        description='Add a service and set up a payment method.'
        icon={Shield}
      />
    </ApprovalSectionLayout>
  );
}

export default ApprovalsEmptyState;
