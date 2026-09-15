import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { AlertCircle, Shield } from "lucide-react";
import ApprovalSectionLayout from "./ApprovalSectionLayout";

/**
 * Each state keeps the section heading and its Approve action, so the reader can
 * still authorize a service while the approvals are loading or failing to load.
 */
type ApprovalsStateProps = {
  onApprove: () => void;
};

export function ApprovalsLoadingState({ onApprove }: ApprovalsStateProps) {
  return (
    <ApprovalSectionLayout handleOpenApprove={onApprove}>
      <LoadingStateCard message='Loading authorized services...' />
    </ApprovalSectionLayout>
  );
}

export function ApprovalsErrorState({ onApprove }: ApprovalsStateProps) {
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

export function ApprovalsEmptyState({ onApprove }: ApprovalsStateProps) {
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
