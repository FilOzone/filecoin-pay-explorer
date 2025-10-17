import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import { ArrowDownCircle, Shield, Wallet } from "lucide-react";
import { useState } from "react";
import { CustomConnectButton } from "@/components/shared";
import { ApproveOperatorDialog } from "../ApproveOperatorDialog";
import DepositAndApproveDialog from "../DepositAndApproveDialog";
import { DepositDialog } from "../DepositDialog";

const AccountNotFound = () => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [depositAndApproveDialogOpen, setDepositAndApproveDialogOpen] = useState(false);

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex justify-between items-center'>
          <h1 className='text-3xl font-bold'>Filecoin Pay Console</h1>
          <CustomConnectButton />
        </div>

        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <Wallet className='h-16 w-16 text-muted-foreground' />
                <EmptyTitle>Welcome to Filecoin Pay</EmptyTitle>
                <EmptyDescription>
                  Your account hasn't been indexed yet. Get started by depositing funds or approving an operator.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className='flex flex-col gap-4 mt-6'>
                  <div className='flex flex-col sm:flex-row gap-3'>
                    <Button onClick={() => setDepositDialogOpen(true)} variant='outline' className='gap-2' size='lg'>
                      <ArrowDownCircle className='h-5 w-5' />
                      Deposit Funds
                    </Button>
                    <Button onClick={() => setApproveDialogOpen(true)} variant='outline' className='gap-2' size='lg'>
                      <Shield className='h-5 w-5' />
                      Approve Service
                    </Button>
                    <Button onClick={() => setDepositAndApproveDialogOpen(true)} className='gap-2' size='lg'>
                      <ArrowDownCircle className='h-5 w-5' />
                      Deposit and Approve Service
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground text-center'>
                    Start by depositing funds or approving an service to get started
                  </p>
                </div>
              </EmptyContent>
            </Empty>
          </div>
        </Card>
      </div>

      {/* Deposit Dialog */}
      <DepositDialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

      {/* Deposit and Approve Dialog */}
      <DepositAndApproveDialog open={depositAndApproveDialogOpen} onOpenChange={setDepositAndApproveDialogOpen} />

      {/* Approve Operator Dialog */}
      <ApproveOperatorDialog operators={[]} tokens={[]} open={approveDialogOpen} onOpenChange={setApproveDialogOpen} />
    </main>
  );
};

export default AccountNotFound;
