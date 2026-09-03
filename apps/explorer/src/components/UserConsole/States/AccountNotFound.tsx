"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { useState } from "react";
import AddServiceDialog from "../AddServiceDialog";
import { useFundingLaunch } from "../FundingLaunchContext";

/**
 * The first thing a new account sees. One primary action opens the same
 * add-funds picker the dashboard uses (FundingHost renders it, or the plain
 * deposit where USDC funding is unavailable), so the paths that work for an
 * empty wallet sit next to the guided add-service flow for USDFC holders.
 */
const AccountNotFound = () => {
  const { openAddFunds } = useFundingLaunch();
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WalletIcon}
      title='Welcome to Filecoin Pay'
      description='Add funds to your account to start paying for services.'
    >
      <div className='mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
        <Button onClick={() => openAddFunds()} size='compact' variant='primary'>
          Add funds
        </Button>
        <Button onClick={() => setAddServiceDialogOpen(true)} size='compact' variant='ghost'>
          Add a service
        </Button>
      </div>

      <AddServiceDialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} />
    </EmptyStateCard>
  );
};

export default AccountNotFound;
