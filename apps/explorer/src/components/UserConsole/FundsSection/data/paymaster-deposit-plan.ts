import type { PublicClient } from "viem";
import {
  getDelegationState,
  getPaymasterGasLimits,
  getPaymasterGasMaximum,
  type PaymasterFees,
  readPaymasterFees,
} from "./circle-paymaster";
import { quoteSwapInputCap } from "./paymaster-batch";
import { sizePaymasterDeposit } from "./paymaster-sizing";
import {
  applyNetworkFeeReviewHeadroom,
  captureReviewedSquidDepositCaps,
  quoteSquidDeposit,
  type SquidClient,
  type SquidDepositQuote,
  type SquidDepositRouteRequest,
} from "./squid-deposit-route";

// ponytail: fixed gas limits price the review reserve, since a quote-only route has no calldata to estimate.
// Execution's bundler estimate must fit inside the reviewed USDC maximum, or the deposit is reviewed again.
const BATCH_CALL_GAS = 400_000n;
const ROUTE_CALL_GAS_FALLBACK = 1_000_000n;
const VERIFICATION_GAS = 250_000n;
/** Base's L1 data charge for an operation carrying a Squid route, which bundlers fold into pre-verification gas. */
const PRE_VERIFICATION_GAS = 1_500_000n;

/** A reviewed USDC-gas deposit: the sized route and the USDC caps execution must stay within. */
export interface PaymasterDepositPlan {
  quote: SquidDepositQuote;
  /** The most native fee the route may carry, as the ETH path caps it; the swap is reserved for this much. */
  maxNativeFee: bigint;
  maxSwapInput: bigint;
  /** USDC gas maximum the user reviews and the permit allows. */
  gasMaximum: bigint;
}

export type PaymasterDepositPlanResult =
  | ({ kind: "sized" } & PaymasterDepositPlan)
  | { kind: "insufficient-usdc"; reserved: bigint }
  | { kind: "not-converged" }
  /** The account delegates to a contract the console did not install, and it never replaces one. */
  | { kind: "conflicting-delegation" };

export interface PlanPaymasterDepositInput {
  /** USDC the user set aside: the deposit, the bridge-fee swap and gas all come out of it. */
  budget: bigint;
  request: Omit<SquidDepositRouteRequest, "sourceAmount" | "filGasTopUp">;
  withFilGasTopUp: boolean;
  squid: SquidClient;
  client: Pick<PublicClient, "getCode" | "multicall" | "simulateContract">;
  /** The bundler's current fee per gas. */
  maxFeePerGas: bigint;
}

function getRouteCallGas(quote: SquidDepositQuote): bigint {
  const gas = quote.gasCosts
    .filter((cost) => cost.token.chainId === quote.sourceChainId)
    .reduce((total, cost) => total + (cost.gasLimit ?? 0n), 0n);
  return gas > 0n ? gas : ROUTE_CALL_GAS_FALLBACK;
}

function getReviewGasMaximum(quote: SquidDepositQuote, fees: PaymasterFees, maxFeePerGas: bigint): bigint {
  return getPaymasterGasMaximum(
    {
      callGasLimit: getRouteCallGas(quote) + BATCH_CALL_GAS,
      verificationGasLimit: VERIFICATION_GAS,
      preVerificationGas: PRE_VERIFICATION_GAS,
      ...getPaymasterGasLimits(fees),
      maxFeePerGas: applyNetworkFeeReviewHeadroom(maxFeePerGas),
    },
    fees,
  );
}

/** Sizes a USDC-gas deposit for review: how much reaches Squid once the swap and gas reserves come out of `budget`. */
export async function planPaymasterDeposit({
  budget,
  client,
  maxFeePerGas,
  request,
  squid,
  withFilGasTopUp,
}: PlanPaymasterDepositInput): Promise<PaymasterDepositPlanResult> {
  const [code, fees] = await Promise.all([client.getCode({ address: request.owner }), readPaymasterFees(client)]);
  if (getDelegationState(code) === "conflict") return { kind: "conflicting-delegation" };
  const sizing = await sizePaymasterDeposit(budget, {
    quoteRoute: async (amount) => {
      const route = await quoteSquidDeposit({ ...request, sourceAmount: amount }, squid, { withFilGasTopUp });
      return { route, nativeFee: captureReviewedSquidDepositCaps(route, request.sourceToken).maxTransactionValue };
    },
    quoteSwapInput: (nativeFee) => quoteSwapInputCap(client, request.sourceToken, nativeFee),
    estimateGasMaximum: async (route) => getReviewGasMaximum(route, fees, maxFeePerGas),
  });
  if (sizing.kind !== "sized") return sizing;
  return {
    kind: "sized",
    quote: sizing.route,
    maxNativeFee: sizing.nativeFee,
    maxSwapInput: sizing.maxSwapInput,
    gasMaximum: sizing.gasMaximum,
  };
}
