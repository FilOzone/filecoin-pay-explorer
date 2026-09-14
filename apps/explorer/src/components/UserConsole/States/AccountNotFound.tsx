import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { ArrowDownCircle } from "lucide-react";
import { useState } from "react";
import AddServiceDialog from "../AddServiceDialog";
import { useFundingLaunch } from "../FundingLaunchContext";

const AccountNotFound = () => {
  const { openAddFunds } = useFundingLaunch();
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description='Add a service and deposit funds to get started — your account activity will show up here.'
    >
      <div className='mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
        <Button onClick={() => setAddServiceDialogOpen(true)} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            <ArrowDownCircle className='h-5 w-5' />
            Deposit and Add Service
          </span>
        </Button>
        <Button onClick={() => openAddFunds()} size='compact' variant='ghost'>
          Add funds
        </Button>
      </div>

      <AddServiceDialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
