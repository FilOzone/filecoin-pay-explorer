import { type ConnectedWallet, useSign7702Authorization } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hash } from "viem";
import {
  awaitPaymasterOperation,
  createPaymasterBundler,
  createPaymasterOperations,
  type ExecutePaymasterDepositInput,
  executePaymasterSquidDeposit,
  readUserOperationGasPrice,
  toPaymasterAccount,
} from "../data/paymaster-deposit-execution";
import { planPaymasterDeposit } from "../data/paymaster-deposit-plan";
import { isPaymasterEligible } from "../data/paymaster-eligibility";
import type { SquidClient, SquidDepositQuote, SquidDepositRouteRequest } from "../data/squid-deposit-route";
import type { PendingSquidDeposit } from "../data/squid-deposit-tracker";

const USDC_GAS_ENABLED = process.env.NEXT_PUBLIC_USDC_GAS_ENABLED === "true";
// "Check again" asks the bundler once more rather than waiting out a full inclusion window.
const RESUME_RECEIPT_TIMEOUT_MS = 15_000;

/** Where the form's USDC-gas plan stands; the review blocker reads it in place of the native balance. */
export type UsdcGasStatus = "planning" | "failed" | "insufficient" | "conflict" | "ready";

type ExecuteInput = Pick<
  ExecutePaymasterDepositInput,
  "assertCurrentContext" | "destinationClient" | "getCurrentOwner" | "onStage" | "plan" | "quote" | "request"
> & {
  walletClient: Parameters<typeof createPaymasterOperations>[1];
  /** How the pending marker names the amount in flight. */
  sourceDecimals: number;
  sourceSymbol: string;
  /** Persists the pending marker; called before the operation is sent and again once it is included. */
  onSave(pending: PendingSquidDeposit): void;
  onBroadcast(transactionHash: Hash): void;
};

/**
 * USDC gas for an embedded wallet paying Base USDC without the ETH the usual path needs: plans the deposit while
 * the form is open, then sends the reviewed one or follows up a sent one.
 */
export function useUsdcGasDeposit({
  active,
  budget,
  nativeBalance,
  quote,
  request,
  requiredNative,
  sourceClient,
  squid,
  wallet,
  withFilGasTopUp,
}: {
  /** The form takes input: nothing is reviewed or executing. */
  active: boolean;
  budget: bigint | null;
  nativeBalance: bigint | undefined;
  /** The form's quote for the whole budget, which sizing starts from. */
  quote: SquidDepositQuote | undefined;
  request: Omit<SquidDepositRouteRequest, "sourceAmount" | "filGasTopUp"> | undefined;
  requiredNative: bigint | null;
  sourceClient: Parameters<typeof createPaymasterBundler>[0] | undefined;
  squid: SquidClient;
  wallet: ConnectedWallet | undefined;
  withFilGasTopUp: boolean;
}) {
  const { signAuthorization } = useSign7702Authorization();
  const bundler = useMemo(() => (sourceClient ? createPaymasterBundler(sourceClient) : undefined), [sourceClient]);
  const isEligible =
    !!wallet &&
    !!request &&
    nativeBalance !== undefined &&
    requiredNative !== null &&
    isPaymasterEligible({
      enabled: USDC_GAS_ENABLED,
      nativeBalance,
      requiredNative,
      sourceChainId: request.sourceChainId,
      sourceToken: request.sourceToken,
      wallet,
    });
  const planQuery = useQuery({
    enabled: active && isEligible && !!bundler && budget !== null,
    queryFn: async () => {
      if (!request || !sourceClient || !bundler || budget === null)
        throw new Error("USDC network fees are unavailable");
      const { maxFeePerGas } = await readUserOperationGasPrice(bundler);
      return planPaymasterDeposit({
        budget,
        client: sourceClient,
        firstQuote: quote,
        maxFeePerGas,
        request,
        squid,
        withFilGasTopUp,
      });
    },
    queryKey: ["direct-squid-usdc-gas-plan", request, budget?.toString(), withFilGasTopUp, quote?.quoteId],
    retry: false,
  });
  const plan = isEligible ? planQuery.data : undefined;
  const status = ((): UsdcGasStatus | undefined => {
    if (!isEligible) return undefined;
    if (planQuery.isError || plan?.kind === "not-converged") return "failed";
    if (!plan) return "planning";
    if (plan.kind === "conflicting-delegation") return "conflict";
    return plan.kind === "insufficient-usdc" ? "insufficient" : "ready";
  })();

  const execute = async ({
    onBroadcast,
    onSave,
    sourceDecimals,
    sourceSymbol,
    walletClient,
    ...input
  }: ExecuteInput) => {
    if (!bundler || !sourceClient) throw new Error("USDC network fees are unavailable");
    const { owner, recipient, sourceAmount, sourceChainId, sourceToken } = input.request;
    const startedAt = Date.now();
    const marker = (fundsBefore: bigint, routeQuote: SquidDepositQuote) => ({
      owner,
      recipient,
      sourceAmount,
      sourceChainId,
      sourceDecimals,
      sourceSymbol,
      sourceToken,
      fundsBefore,
      minimumDestinationAmount: routeQuote.minimumDestinationAmount,
      quoteId: routeQuote.quoteId,
      startedAt,
    });
    return executePaymasterSquidDeposit({
      ...input,
      onBroadcast: ({ fundsBefore, quote: routeQuote, transactionHash }) => {
        onSave({ ...marker(fundsBefore, routeQuote), executionStage: "swap-broadcast", transactionHash });
        onBroadcast(transactionHash);
      },
      onSubmit: ({ fundsBefore, quote: routeQuote, userOperationHash }) =>
        onSave({ ...marker(fundsBefore, routeQuote), executionStage: "swap-requested", userOperationHash }),
      operations: createPaymasterOperations(await toPaymasterAccount(sourceClient, owner), walletClient, bundler),
      signAuthorization: (authorization) => signAuthorization(authorization, { address: owner }),
      sourceClient,
      squid,
    });
  };

  /** The bundle transaction of a pending deposit's operation, once Base includes it. */
  const waitForOperation = ({ owner, userOperationHash }: PendingSquidDeposit) => {
    if (!bundler || !userOperationHash) throw new Error("USDC network fees are unavailable");
    return awaitPaymasterOperation(
      { waitForReceipt: (hash, timeout) => bundler.waitForUserOperationReceipt({ hash, timeout }) },
      userOperationHash,
      owner,
      RESUME_RECEIPT_TIMEOUT_MS,
    );
  };

  return { execute, plan: plan?.kind === "sized" ? plan : undefined, status, waitForOperation };
}
