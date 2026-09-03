"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId } from "@/utils/network";
import { AddFundsDialog, type AddFundsMethod, PayFromOtherNetworkDialog } from "./components";
import { isCrossChainFundingAvailable } from "./data/cross-chain-funding-availability";
import { useCardPurchase } from "./hooks/useCardPurchase";

// One page covers every token an account realistically holds; see FundsSection.
const TOKEN_PAGE_SIZE = 100;

/**
 * The single place the console-wide funding dialogs are rendered: the
 * add-funds picker the wallet menu opens from any console page, the plain
 * deposit it can lead to (or stands in for where cross-network payments are
 * unavailable), and the "Pay from another network" dialog. It lives in the
 * console layout and keys on the address so a change of identity starts fresh.
 */
export function FundingHost() {
  const { address, chainId } = useConnection();
  if (!address) return null;
  return <FundingDialogs address={address} chainId={chainId} key={address} />;
}

function FundingDialogs({ address, chainId }: { address: string; chainId: number | undefined }) {
  const launch = useFundingLaunch();
  const [isDepositOpen, setDepositOpen] = useState(false);
  const network = getNetworkFromChainId(chainId);
  const canPayCrossChain = isCrossChainFundingAvailable(chainId);
  const card = useCardPurchase({ address, onPurchased: launch.openCrossChainPayment });
  // Subgraph account ids are lowercase addresses.
  const accountId = address.toLowerCase();
  const { data: tokens } = useAccountTokens(accountId, 1, { networkOverride: network, pageSize: TOKEN_PAGE_SIZE });

  // Without cross-network payments the picker would offer a single method, so
  // Add funds is the deposit itself there.
  const isPickerOpen = canPayCrossChain && launch.isAddFundsOpen;
  const showDeposit = isDepositOpen || (!canPayCrossChain && launch.isAddFundsOpen);

  const chooseMethod = (method: AddFundsMethod) => {
    launch.closeAddFunds();
    if (method === "crosschain") launch.openCrossChainPayment();
    else if (method === "card") void card.buyWithCard();
    else setDepositOpen(true);
  };
  const handleDepositOpenChange = (open: boolean) => {
    setDepositOpen(open);
    if (!open) launch.closeAddFunds();
  };

  return (
    <>
      {canPayCrossChain ? (
        <AddFundsDialog
          cardLabel={card.label}
          crossChainAvailable
          onOpenChange={(open) => (open ? launch.openAddFunds() : launch.closeAddFunds())}
          onSelect={chooseMethod}
          open={isPickerOpen}
        />
      ) : null}
      {/* The deposit opens on the token the request named, else on its picker. */}
      <DepositDialog
        depositToken={launch.depositToken}
        onOpenChange={handleDepositOpenChange}
        open={showDeposit}
        tokens={tokens?.userTokens ?? []}
      />
      {canPayCrossChain ? (
        <PayFromOtherNetworkDialog
          accountId={accountId}
          onOpenChange={(open) => (open ? launch.openCrossChainPayment() : launch.closeCrossChainPayment())}
          open={launch.isCrossChainPaymentOpen}
        />
      ) : null}
    </>
  );
}
