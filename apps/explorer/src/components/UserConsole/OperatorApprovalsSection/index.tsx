import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account, OperatorApproval } from "@filecoin-pay/types";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ApproveOperatorDialog } from "@/components/UserConsole/ApproveOperatorDialog";
import { IncreaseApprovalDialog } from "@/components/UserConsole/IncreaseApprovalDialog";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { useAccountApprovals } from "@/hooks/useAccountDetails";
import { ApprovalsEmptyState, ApprovalsErrorState, ApprovalsLoadingState, ApprovalsTable } from "./components";

interface OperatorApprovalsSectionProps {
  account: Account;
}

export const OperatorApprovalsSection: React.FC<OperatorApprovalsSectionProps> = ({ account }) => {
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [increaseDialogOpen, setIncreaseDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<OperatorApproval | null>(null);

  const { data, isLoading, isError } = useAccountApprovals(account.id, 1);

  const handleIncrease = useCallback((approval: OperatorApproval) => {
    setSelectedApproval(approval);
    setIncreaseDialogOpen(true);
  }, []);

  const handleOpenApprove = useCallback(() => {
    setApproveDialogOpen(true);
  }, []);

  // Prepare table data with onIncrease handler
  const tableData = useMemo(
    () => data?.operatorApprovals.map((approval) => ({ ...approval, onIncrease: handleIncrease })) || [],
    [data, handleIncrease],
  );

  if (isLoading) {
    return <ApprovalsLoadingState onApprove={handleOpenApprove} />;
  }

  if (isError) {
    return <ApprovalsErrorState onApprove={handleOpenApprove} />;
  }

  if (!data || data.operatorApprovals.length === 0) {
    return (
      <>
        <ApprovalsEmptyState onApprove={handleOpenApprove} />
        <ApproveOperatorDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen} />
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-2xl font-medium'>Authorized Services</h3>
          <Button baseDomain={BASE_DOMAIN} variant='primary' onClick={handleOpenApprove} className='py-2'>
            <span className='flex items-center gap-2'>
              <Plus className='h-4 w-4' />
              Approve Service
            </span>
          </Button>
        </div>

        <ApprovalsTable data={tableData} />
      </div>

      {/* Dialogs */}
      <ApproveOperatorDialog
        open={approveDialogOpen}
        operators={data.operatorApprovals.map((approval) => approval.operator)}
        tokens={data.operatorApprovals.map((approval) => approval.token)}
        onOpenChange={setApproveDialogOpen}
      />
      {selectedApproval && (
        <IncreaseApprovalDialog
          approval={selectedApproval}
          open={increaseDialogOpen}
          onOpenChange={setIncreaseDialogOpen}
        />
      )}
    </>
  );
};
