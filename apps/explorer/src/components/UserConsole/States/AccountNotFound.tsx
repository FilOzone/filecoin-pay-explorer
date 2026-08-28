import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { ArrowDownCircle } from "lucide-react";
import { useState } from "react";
import AddServiceDialog from "../AddServiceDialog";

const AccountNotFound = () => {
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description='Add a service and deposit funds to get started — your account activity will show up here.'
    >
      <div className='flex justify-center mt-6'>
        <Button onClick={() => setAddServiceDialogOpen(true)} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            <ArrowDownCircle className='h-5 w-5' />
            Deposit and Add Service
          </span>
        </Button>
      </div>

      <AddServiceDialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
