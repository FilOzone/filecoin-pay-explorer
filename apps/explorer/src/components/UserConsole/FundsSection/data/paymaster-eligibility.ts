import type { ConnectedWallet } from "@privy-io/react-auth";
import type { Address, Hex } from "viem";
import { isPrivyEmbeddedWallet } from "../../console-wallet";
import { CIRCLE_PAYMASTER_CHAIN_ID, CIRCLE_PAYMASTER_TOKEN } from "./circle-paymaster";

/** eth-infinitism Simple7702Account for EntryPoint v0.8, the delegate viem's `toSimple7702SmartAccount` signs for. */
export const SIMPLE_7702_ACCOUNT_ADDRESS: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";

/** `ours` reuses the delegation; `conflict` is another delegate (or a contract) the console must never overwrite. */
export type DelegationState = "none" | "ours" | "conflict";

const OUR_DELEGATION = `0xef0100${SIMPLE_7702_ACCOUNT_ADDRESS.slice(2)}`.toLowerCase();

export function getDelegationState(code: Hex | undefined): DelegationState {
  if (code === undefined || code === "0x") return "none";
  return code.toLowerCase() === OUR_DELEGATION ? "ours" : "conflict";
}

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
