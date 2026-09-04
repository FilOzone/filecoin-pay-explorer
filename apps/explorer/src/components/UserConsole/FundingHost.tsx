"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { calibration, mainnet } from "@/constants/chains";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { DepositDialog } from "./DepositDialog";
import { useFundingLaunch } from "./FundingLaunchContext";
import { AddFundsDialog, type AddFundsMethod } from "./FundsSection/components";
import { TopUpDialogController } from "./FundsSection/TopUpDialogController";

const TOKEN_PAGE_SIZE = 100;

export function FundingHost() {
  const { address, chainId } = useConnection();
  if (!address) return null;
  return <FundingDialogs address={address} chainId={chainId} key={address} />;
}

function FundingDialogs({ address, chainId }: { address: string; chainId: number | undefined }) {
  const launch = useFundingLaunch();
  const [isDepositOpen, setDepositOpen] = useState(false);
  const isMainnet = chainId === undefined || chainId === mainnet.id;
  const isCalibration = chainId === calibration.id;
  const network = isCalibration ? "calibration" : "mainnet";
  const previousChainId = useRef(chainId);
  const chainChanged = previousChainId.current !== chainId;
  const { data } = useAccountTokens(isMainnet || isCalibration ? address.toLowerCase() : "", 1, {
    networkOverride: network,
    pageSize: TOKEN_PAGE_SIZE,
  });

  useEffect(() => {
    previousChainId.current = chainId;
    setDepositOpen(false);
    launch.closeAddFunds();
  }, [chainId, launch.closeAddFunds]);

  const handleDepositOpenChange = (open: boolean) => {
    setDepositOpen(open);
    if (!open) launch.closeAddFunds();
  };

  return (
    <TopUpDialogController accountId={address.toLowerCase()}>
      {(openTopUp) => {
        const chooseMethod = (method: AddFundsMethod) => {
          launch.closeAddFunds();
          if (method === "squid") openTopUp();
          else setDepositOpen(true);
        };

        return (
          <>
            {isMainnet ? (
              <AddFundsDialog
                onOpenChange={(open) => (open ? launch.openAddFunds(launch.depositToken) : launch.closeAddFunds())}
                onSelect={chooseMethod}
                open={!chainChanged && launch.isAddFundsOpen}
                squidAvailable
              />
            ) : null}
            {isMainnet || isCalibration ? (
              <DepositDialog
                depositToken={launch.depositToken}
                key={network}
                onOpenChange={handleDepositOpenChange}
                open={!chainChanged && (isDepositOpen || (isCalibration && launch.isAddFundsOpen))}
                tokens={data?.userTokens ?? []}
              />
            ) : null}
          </>
        );
      }}
    </TopUpDialogController>
  );
}
