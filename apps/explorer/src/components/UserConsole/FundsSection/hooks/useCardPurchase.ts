"use client";

import { useFiatOnramp, useLogin, usePrivy } from "@privy-io/react-auth";
import { useRef } from "react";
import {
  BASE_CHAIN_ID,
  BASE_USDC,
  buildCardOnrampOptions,
  readOnrampEnvironment,
  runPrivyFunding,
} from "@/components/UserConsole/privy-funding";

/**
 * Privy's card onramp, delivering USDC on Base to `address`, then `onPurchased`
 * (which opens the USDC payment so the purchase goes straight into the account).
 * The onramp needs a Privy session, so a connect-only wallet logs in first and
 * the purchase continues once login completes.
 */
export function useCardPurchase({ address, onPurchased }: { address: string | undefined; onPurchased: () => void }) {
  const { authenticated } = usePrivy();
  const { fund } = useFiatOnramp();
  const purchaseAfterLogin = useRef(false);

  const purchase = async () => {
    if (!address) return;
    const funded = await runPrivyFunding(
      () =>
        fund(
          buildCardOnrampOptions({
            address,
            asset: BASE_USDC,
            chainId: BASE_CHAIN_ID,
            environment: readOnrampEnvironment(),
          }),
        ),
      { unavailableTitle: "Card purchases are unavailable" },
    );
    if (funded) onPurchased();
  };

  const { login } = useLogin({
    onComplete: () => {
      if (!purchaseAfterLogin.current) return;
      purchaseAfterLogin.current = false;
      void purchase();
    },
  });

  const buyWithCard = () => {
    if (authenticated) return purchase();
    purchaseAfterLogin.current = true;
    login();
  };

  return { buyWithCard, label: authenticated ? "Buy USDC with card" : "Log in to buy with card" };
}
