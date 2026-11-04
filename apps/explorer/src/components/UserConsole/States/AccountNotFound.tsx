import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowDownCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import type { Network } from "@/types";
import AddServiceDialog from "../AddServiceDialog";

const AccountNotFound = ({ network }: { network: Network }) => {
  const { clearFundingAfterSignup, signupUserId, openAddFunds } = useFundingLaunch();
  const { user } = usePrivy();
  const userId = user?.id ?? null;
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  // A wallet that just signed up has nothing to do until it is funded, so Add funds opens once.
  // This card renders only on the overview of an account Filecoin Pay has never seen, so a
  // setup link or a returning account is never interrupted. A request left by another user, or
  // by a session that has since logged out, is dropped instead.
  useEffect(() => {
    if (!signupUserId) return;
    clearFundingAfterSignup();
    if (signupUserId === userId) openAddFunds();
  }, [signupUserId, userId, clearFundingAfterSignup, openAddFunds]);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description='Add funds to your account first, then add a service to pay with them. Your account activity will show up here.'
    >
      <div className='mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
        <Button onClick={() => openAddFunds()} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            <ArrowDownCircle className='h-5 w-5' />
            Add funds
          </span>
        </Button>
        <Button onClick={() => setAddServiceDialogOpen(true)} size='compact' variant='ghost'>
          Add a service
        </Button>
      </div>

      <AddServiceDialog network={network} open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
