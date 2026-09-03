"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { CONSOLE_TOKEN_PAGE_SIZE, useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";
import { DepositDialog } from "./DepositDialog";
import { useFundingLaunch } from "./FundingLaunchContext";
import { AddFundsDialog, type AddFundsMethod } from "./FundsSection/components";
import { DirectSquidDepositDialog } from "./FundsSection/components/DirectSquidDepositDialog";
import { TopUpDialogController } from "./FundsSection/TopUpDialogController";

export function FundingHost() {
  const { address, chainId } = useConnection();
  if (!address) return null;
  return <FundingDialogs address={address} chainId={chainId} key={address} />;
}

function FundingDialogs({ address, chainId }: { address: string; chainId: number | undefined }) {
  const launch = useFundingLaunch();
  const [isDepositOpen, setDepositOpen] = useState(false);
  const [isSquidOpen, setSquidOpen] = useState(false);
  // An undefined chain id only occurs while wagmi reconnects; treat it as the default network.
  const isFilecoinChain = chainId === undefined || isSupportedChainId(chainId);
  const network = getNetworkFromChainId(chainId);
  const isMainnet = isFilecoinChain && network === "mainnet";
  const isCalibration = isFilecoinChain && network === "calibration";
  // The effect below closes every dialog after a chain change, but that runs one
  // render late. Comparing against the last committed chain id keeps the dialogs
  // closed during that render so nothing reopens on the new network.
  const previousChainId = useRef(chainId);
  const chainChanged = previousChainId.current !== chainId;
  const { data } = useAccountTokens(address.toLowerCase(), 1, {
    enabled: isFilecoinChain,
    networkOverride: network,
    pageSize: CONSOLE_TOKEN_PAGE_SIZE,
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
      {() => {
        const chooseMethod = (method: AddFundsMethod) => {
          launch.closeAddFunds();
          if (method === "squid") setSquidOpen(true);
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
            <DirectSquidDepositDialog
              accountId={address.toLowerCase()}
              onOpenChange={setSquidOpen}
              open={isSquidOpen}
            />
          </>
        );
      }}
    </TopUpDialogController>
  );
}
