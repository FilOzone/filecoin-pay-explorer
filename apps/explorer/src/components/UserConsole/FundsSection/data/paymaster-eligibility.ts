import type { ConnectedWallet } from "@privy-io/react-auth";
import { isPrivyEmbeddedWallet } from "../../console-wallet";
import { CIRCLE_PAYMASTER_CHAIN_ID, CIRCLE_PAYMASTER_TOKEN } from "./circle-paymaster";

export interface PaymasterEligibilityInput {
  enabled: boolean;
  wallet: Pick<ConnectedWallet, "walletClientType">;
  sourceChainId: number;
  sourceToken: string;
  /** The payer's ETH on the source network. */
  nativeBalance: bigint;
  /** ETH the existing path needs: reviewed gas plus the route's bridge fee. */
  requiredNative: bigint;
}

/** USDC gas is only for embedded wallets paying Base USDC that cannot cover today's ETH path. */
export function isPaymasterEligible(input: PaymasterEligibilityInput): boolean {
  return (
    input.enabled &&
    isPrivyEmbeddedWallet(input.wallet) &&
    input.sourceChainId === CIRCLE_PAYMASTER_CHAIN_ID &&
    input.sourceToken.toLowerCase() === CIRCLE_PAYMASTER_TOKEN.toLowerCase() &&
    input.nativeBalance < input.requiredNative
  );
}
