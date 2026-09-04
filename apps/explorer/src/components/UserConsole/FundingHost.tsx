"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { calibration, mainnet } from "@/constants/chains";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { DepositDialog } from "./DepositDialog";
import { useFundingLaunch } from "./FundingLaunchContext";
import { AddFundsDialog, type AddFundsMethod } from "./FundsSection/components";
import { DirectSquidDepositDialog } from "./FundsSection/components/DirectSquidDepositDialog";
import { CARD_CHAIN_ID, CARD_USDC, CARD_USDC_DECIMALS, useCardPurchase } from "./FundsSection/hooks/useCardPurchase";
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
  const [isSquidOpen, setSquidOpen] = useState(false);
  const [cardSourceAmount, setCardSourceAmount] = useState<bigint>();
  const isMainnet = chainId === undefined || chainId === mainnet.id;
  const isCalibration = chainId === calibration.id;
  const network = isCalibration ? "calibration" : "mainnet";
  const previousChainId = useRef(chainId);
  const chainChanged = previousChainId.current !== chainId;
  const { data } = useAccountTokens(isMainnet || isCalibration ? address.toLowerCase() : "", 1, {
    networkOverride: network,
    pageSize: TOKEN_PAGE_SIZE,
  });
  const card = useCardPurchase({
    address,
    contextKey: `${address}:${chainId ?? "unknown"}`,
    onPurchased: (amount) => {
      setCardSourceAmount(amount);
      launch.closeAddFunds();
      setSquidOpen(true);
    },
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
          if (method === "card") {
            void card.buyWithCard();
            return;
          }
          launch.closeAddFunds();
          if (method === "squid") setSquidOpen(true);
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
              initialSource={
                cardSourceAmount
                  ? { amount: cardSourceAmount, chainId: CARD_CHAIN_ID, decimals: CARD_USDC_DECIMALS, token: CARD_USDC }
                  : undefined
              }
              onOpenChange={(open) => {
                setSquidOpen(open);
                if (!open) setCardSourceAmount(undefined);
              }}
              open={isSquidOpen}
            />
          </>
        );
      }}
    </TopUpDialogController>
  );
}
