import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account, OperatorApproval } from "@filecoin-pay/types";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import AddServiceDialog from "@/components/UserConsole/AddServiceDialog";
import { IncreaseApprovalDialog } from "@/components/UserConsole/IncreaseApprovalDialog";
import { useInfiniteAccountApprovals } from "@/hooks/useAccountDetails";
import type { Network } from "@/types";
import { ApprovalsEmptyState, ApprovalsErrorState, ApprovalsLoadingState, ApprovalsTable } from "./components";

interface OperatorApprovalsSectionProps {
  account: Account;
  network: Network;
}

export const OperatorApprovalsSection: React.FC<OperatorApprovalsSectionProps> = ({ account, network }) => {
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [increaseDialogOpen, setIncreaseDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<OperatorApproval | null>(null);

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteAccountApprovals(
    account.id,
    { networkOverride: network },
  );
  const approvals = useMemo(() => data?.pages.flatMap((page) => page.operatorApprovals) ?? [], [data]);

  const handleIncrease = useCallback((approval: OperatorApproval) => {
    setSelectedApproval(approval);
    setIncreaseDialogOpen(true);
  }, []);

  const handleOpenApprove = useCallback(() => {
    setApproveDialogOpen(true);
  }, []);

  let content: React.ReactNode;
  if (isLoading) {
    content = <ApprovalsLoadingState onApprove={handleOpenApprove} />;
  } else if (isError) {
    content = <ApprovalsErrorState onApprove={handleOpenApprove} />;
  } else if (approvals.length === 0) {
    content = <ApprovalsEmptyState onApprove={handleOpenApprove} />;
  } else {
    content = (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-2xl font-medium'>Authorized Services</h3>
          <Button variant='primary' onClick={handleOpenApprove} className='py-2'>
            <span className='flex items-center gap-2'>
              <Plus className='h-4 w-4' />
              Add Service
            </span>
          </Button>
        </div>

        <ApprovalsTable data={approvals} onIncrease={handleIncrease} />

        {hasNextPage ? (
          <div className='flex justify-center'>
            <Button variant='tertiary' size='compact' onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {content}

      {/* Dialogs */}
      <AddServiceDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen} />
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
