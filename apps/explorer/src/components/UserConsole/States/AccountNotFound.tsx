import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { ArrowDownCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import type { Network } from "@/types";
import AddServiceDialog from "../AddServiceDialog";

const AccountNotFound = ({ network }: { network: Network }) => {
  const { isAddFundsOpen, isFundingAfterSignup, openAddFunds } = useFundingLaunch();
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  // A new signup has nothing to do until funded; the request lasts until the user acts on Add funds.
  useEffect(() => {
    if (isFundingAfterSignup && !isAddFundsOpen) openAddFunds();
  }, [isFundingAfterSignup, isAddFundsOpen, openAddFunds]);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description='Add funds to get started, then add a service to pay with them.'
    >
      <div className='mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
        <Button onClick={() => openAddFunds()} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            <ArrowDownCircle className='h-5 w-5' />
            Add funds
          </span>
        </Button>
        <Button onClick={() => setAddServiceDialogOpen(true)} size='compact' variant='ghost'>
          Add service
        </Button>
      </div>

      <AddServiceDialog network={network} open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
