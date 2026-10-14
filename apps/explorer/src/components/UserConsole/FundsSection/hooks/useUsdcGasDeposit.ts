import { type ConnectedWallet, useSign7702Authorization } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { getUsdcGasStatus, planPaymasterDeposit } from "../data/paymaster-deposit-plan";
import { isPaymasterEligible } from "../data/paymaster-eligibility";
import type { SquidClient, SquidDepositQuote, SquidDepositRouteRequest } from "../data/squid-deposit-route";
import type { PendingSquidDeposit } from "../data/squid-deposit-tracker";
import { walletErrorMessage } from "../data/squid-execution";

const USDC_GAS_ENABLED = process.env.NEXT_PUBLIC_USDC_GAS_ENABLED === "true";
// "Check again" asks the bundler once more rather than waiting out a full inclusion window.
const RESUME_RECEIPT_TIMEOUT_MS = 15_000;

type ExecuteInput = Pick<
  ExecutePaymasterDepositInput,
  "assertCurrentContext" | "destinationClient" | "getCurrentOwner" | "onStage" | "plan" | "quote" | "request"
> & {
  walletClient: Parameters<typeof createPaymasterOperations>[1];
  sourceDecimals: number;
  sourceSymbol: string;
  // Called before the operation is sent, so a reload finds it, and again once it is included.
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
  const queryClient = useQueryClient();
  const inputs = JSON.stringify([request, budget?.toString(), withFilGasTopUp]);
  // What an execution needed above its review; it only applies to the inputs it was measured for.
  const [floor, setFloor] = useState<{ inputs: string; amount: bigint }>();
  const gasMaximumFloor = floor?.inputs === inputs ? floor.amount : undefined;
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
        gasMaximumFloor,
        maxFeePerGas,
        request,
        squid,
        withFilGasTopUp,
      });
    },
    queryKey: ["direct-squid-usdc-gas-plan", request, budget?.toString(), withFilGasTopUp, gasMaximumFloor?.toString()],
    retry: false,
  });
  const plan = isEligible ? planQuery.data : undefined;
  const status = isEligible ? getUsdcGasStatus(plan, planQuery.isError) : undefined;
  const error = (() => {
    if (status?.status !== "failed") return null;
    if (plan?.kind === "not-converged") return "Squid's quote kept changing while USDC was set aside for fees.";
    return `Network fees in USDC could not be estimated. ${walletErrorMessage(planQuery.error, "")}`.trim();
  })();

  // The reviewed plan no longer holds: drop it so Review waits for a fresh one that reserves at least `gasFloor`.
  const reviewAgain = (gasFloor: bigint | undefined) => {
    if (gasFloor !== undefined) setFloor({ inputs, amount: gasFloor });
    void queryClient.resetQueries({ queryKey: ["direct-squid-usdc-gas-plan"] });
  };

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

  // Follows a pending deposit's operation to its bundle transaction and saves the marker with it.
  const waitForOperation = async (pending: PendingSquidDeposit, onSave: (pending: PendingSquidDeposit) => void) => {
    if (!bundler || !pending.userOperationHash) throw new Error("USDC network fees are unavailable");
    const transactionHash = await awaitPaymasterOperation(
      { waitForReceipt: (hash, timeout) => bundler.waitForUserOperationReceipt({ hash, timeout }) },
      pending.userOperationHash,
      pending.owner,
      RESUME_RECEIPT_TIMEOUT_MS,
    );
    onSave({ ...pending, executionStage: "swap-broadcast", transactionHash });
    return transactionHash;
  };

  return {
    error,
    execute,
    plan: plan?.kind === "sized" ? plan : undefined,
    retry: () => void planQuery.refetch(),
    reviewAgain,
    status,
    waitForOperation,
  };
}
