import { type ConnectedWallet, useSign7702Authorization } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hash } from "viem";
import { isPrivyEmbeddedWallet } from "../../console-wallet";
import { CIRCLE_PAYMASTER_CHAIN_ID, CIRCLE_PAYMASTER_TOKEN } from "../data/circle-paymaster";
import {
  awaitPaymasterOperation,
  createPaymasterBundler,
  createPaymasterOperations,
  type ExecutePaymasterDepositInput,
  executePaymasterSquidDeposit,
  toPaymasterAccount,
} from "../data/paymaster-deposit-execution";
import { getUsdcGasStatus, planPaymasterDeposit } from "../data/paymaster-deposit-plan";
import type { SquidClient, SquidDepositQuote, SquidDepositRouteRequest } from "../data/squid-deposit-route";
import type { PendingSquidDeposit } from "../data/squid-deposit-tracker";
import { walletErrorMessage } from "../data/squid-execution";

// "Check again" asks the bundler once more rather than waiting out a full inclusion window.
const RESUME_RECEIPT_TIMEOUT_MS = 15_000;

type ExecuteInput = Pick<
  ExecutePaymasterDepositInput,
  "assertCurrentContext" | "destinationClient" | "getCurrentOwner" | "onStage" | "quote" | "request" | "reviewedQuote"
> & {
  walletClient: Parameters<typeof createPaymasterOperations>[1];
  sourceDecimals: number;
  sourceSymbol: string;
  // Called before the operation is sent, so a reload finds it, and again once it is included.
  onSave(pending: PendingSquidDeposit): void;
  onBroadcast(transactionHash: Hash): void;
};

/**
 * USDC gas for an embedded wallet paying Base USDC, which always pays Base gas in USDC: checks the payer while the
 * form is open, then sends the reviewed deposit or follows up a sent one.
 */
export function useUsdcGasDeposit({
  active,
  budget,
  request,
  sourceClient,
  squid,
  wallet,
}: {
  /** The form takes input: nothing is reviewed or executing. */
  active: boolean;
  budget: bigint | null;
  request: Pick<SquidDepositRouteRequest, "owner" | "sourceChainId" | "sourceToken"> | undefined;
  sourceClient: Parameters<typeof createPaymasterBundler>[0] | undefined;
  squid: SquidClient;
  wallet: ConnectedWallet | undefined;
}) {
  const { signAuthorization } = useSign7702Authorization();
  const queryClient = useQueryClient();
  const bundler = useMemo(() => (sourceClient ? createPaymasterBundler(sourceClient) : undefined), [sourceClient]);
  const isEligible =
    !!wallet &&
    !!request &&
    isPrivyEmbeddedWallet(wallet) &&
    request.sourceChainId === CIRCLE_PAYMASTER_CHAIN_ID &&
    request.sourceToken.toLowerCase() === CIRCLE_PAYMASTER_TOKEN.toLowerCase();
  const planKey = ["direct-squid-usdc-gas-plan", request?.owner] as const;
  const planQuery = useQuery({
    enabled: active && isEligible && !!sourceClient,
    queryFn: () => {
      if (!request || !sourceClient) throw new Error("USDC network fees are unavailable");
      return planPaymasterDeposit(sourceClient, request.owner);
    },
    queryKey: planKey,
    retry: false,
  });
  const status = isEligible ? getUsdcGasStatus(budget, planQuery.data, planQuery.isError) : undefined;
  const error =
    status?.status === "failed"
      ? `Network fees in USDC could not be estimated. ${walletErrorMessage(planQuery.error, "")}`.trim()
      : null;

  // The reviewed deposit no longer holds: drop the check so Review waits for a fresh one.
  const reviewAgain = () => void queryClient.resetQueries({ queryKey: planKey });

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
    isEligible,
    retry: () => void planQuery.refetch(),
    reviewAgain,
    status,
    waitForOperation,
  };
}
