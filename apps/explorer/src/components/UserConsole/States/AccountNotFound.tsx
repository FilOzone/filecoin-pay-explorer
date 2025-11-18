// import { Button } from "@filecoin-pay/ui/components/button";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { ArrowDownCircle, Shield } from "lucide-react";
import { useState } from "react";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { ApproveOperatorDialog } from "../ApproveOperatorDialog";
import DepositAndApproveDialog from "../DepositAndApproveDialog";
import { DepositDialog } from "../DepositDialog";

const AccountNotFound = () => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [depositAndApproveDialogOpen, setDepositAndApproveDialogOpen] = useState(false);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description="Your account hasn't been indexed yet. Get started by depositing funds or approving an service."
    >
      <div className='flex flex-col gap-4 mt-6'>
        <div className='flex flex-col sm:flex-row gap-3'>
          <Button
            baseDomain={BASE_DOMAIN}
            onClick={() => setDepositDialogOpen(true)}
            variant='ghost'
            className='gap-2 py-2'
          >
            <span className='flex items-center gap-2'>
              <ArrowDownCircle className='h-5 w-5' />
              Deposit Funds
            </span>
          </Button>
          <Button
            baseDomain={BASE_DOMAIN}
            onClick={() => setApproveDialogOpen(true)}
            variant='ghost'
            className='gap-2 py-2'
          >
            <span className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Approve Service
            </span>
          </Button>
          <Button
            baseDomain={BASE_DOMAIN}
            onClick={() => setDepositAndApproveDialogOpen(true)}
            className='gap-2 py-2'
            variant='primary'
          >
            <span className='flex items-center gap-2'>
              <ArrowDownCircle className='h-5 w-5' />
              Deposit and Approve Service
            </span>
          </Button>
        </div>
        <p className='text-xs text-muted-foreground text-center'>
          Start by depositing funds or approving a service to get started
        </p>
      </div>

      {/* Deposit Dialog */}
      <DepositDialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

      {/* Deposit and Approve Dialog */}
      <DepositAndApproveDialog open={depositAndApproveDialogOpen} onOpenChange={setDepositAndApproveDialogOpen} />

      {/* Approve Operator Dialog */}
      <ApproveOperatorDialog operators={[]} tokens={[]} open={approveDialogOpen} onOpenChange={setApproveDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
