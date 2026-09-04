"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { getChain } from "@/constants/chains";
import { CONSOLE_TOKEN_PAGE_SIZE, useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";
import { DepositDialog } from "./DepositDialog";
import { useFundingLaunch } from "./FundingLaunchContext";
import { AddFundsDialog, type AddFundsMethod } from "./FundsSection/components";
import {
  DirectSquidDepositDialog,
  type SquidDepositInitialSource,
} from "./FundsSection/components/DirectSquidDepositDialog";
import { CARD_CHAIN_ID, CARD_USDC, CARD_USDC_DECIMALS, useCardPurchase } from "./FundsSection/hooks/useCardPurchase";
import { TopUpDialogController } from "./FundsSection/TopUpDialogController";

export function FundingHost() {
  const { address, chainId } = useConnection();
  if (!address) return null;
  return <FundingDialogs address={address} chainId={chainId} key={address} />;
}

function FundingDialogs({ address, chainId }: { address: string; chainId: number | undefined }) {
  const launch = useFundingLaunch();
  const [isDepositOpen, setDepositOpen] = useState(false);
  const [cardSource, setCardSource] = useState<SquidDepositInitialSource>();
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
  const card = useCardPurchase({
    address,
    // A reconnecting wallet reports no chain id for a moment; that is not a network change.
    contextKey: `${address}:${chainId ?? getChain(network).id}`,
    onPurchased: (amount) => {
      setCardSource({ amount, chainId: CARD_CHAIN_ID, decimals: CARD_USDC_DECIMALS, token: CARD_USDC });
      launch.openSquid();
    },
  });

  useEffect(() => {
    previousChainId.current = chainId;
    setDepositOpen(false);
    launch.closeAddFunds();
    launch.closeSquid();
  }, [chainId, launch.closeAddFunds, launch.closeSquid]);

  const handleDepositOpenChange = (open: boolean) => {
    setDepositOpen(open);
    if (!open) launch.closeAddFunds();
  };

  return (
    <TopUpDialogController accountId={address.toLowerCase()}>
      {() => {
        const chooseMethod = (method: AddFundsMethod) => {
          if (method === "card") {
            void card.buyWithCard();
            return;
          }
          launch.closeAddFunds();
          if (method === "squid") launch.openSquid();
          else setDepositOpen(true);
        };

        return (
          <>
            {isMainnet ? (
              <AddFundsDialog
                cardLabel={card.label}
                cardStatus={card.statusMessage}
                isBusy={card.isBusy}
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
              initialSource={cardSource}
              onOpenChange={(open) => {
                if (open) launch.openSquid();
                else {
                  launch.closeSquid();
                  setCardSource(undefined);
                }
              }}
              open={!chainChanged && launch.isSquidOpen}
            />
          </>
        );
      }}
    </TopUpDialogController>
  );
}
