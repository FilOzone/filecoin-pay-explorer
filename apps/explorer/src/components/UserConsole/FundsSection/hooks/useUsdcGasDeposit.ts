import { type ConnectedWallet, useSign7702Authorization } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { walletErrorMessage } from "@/utils/walletErrors";
import { isPrivyEmbeddedWallet } from "../../console-wallet";
import { CIRCLE_PAYMASTER_CHAIN_ID, CIRCLE_PAYMASTER_TOKEN } from "../data/circle-paymaster";
import {
  awaitPaymasterOperation,
  createPaymasterBundler,
  type ExecutePaymasterDepositInput,
  executePaymasterSquidDeposit,
  toPaymasterAccount,
} from "../data/paymaster-deposit-execution";
import type { SquidClient, SquidDepositRouteRequest } from "../data/squid-deposit-route";
import type { PendingSquidDeposit } from "../data/squid-deposit-tracker";
import { checkUsdcGasPayer } from "../data/usdc-gas-payer";

// "Check again" asks the bundler once more rather than waiting out a full inclusion window.
const RESUME_RECEIPT_TIMEOUT_MS = 15_000;

type ExecuteInput = Pick<
  ExecutePaymasterDepositInput,
  | "assertCurrentContext"
  | "destinationClient"
  | "getCurrentOwner"
  | "onBroadcast"
  | "onStage"
  | "onSubmit"
  | "quote"
  | "refreshQuote"
  | "request"
  | "reviewedQuote"
  | "walletClient"
>;

/**
 * USDC gas for an embedded wallet paying Base USDC, which always pays Base gas in USDC: checks the payer while the
 * form is open, then sends the reviewed deposit or follows up a sent one.
 */
export function useUsdcGasDeposit({
  active,
  request,
  sourceClient,
  squid,
  wallet,
}: {
  /** The form takes input: nothing is reviewed or executing. */
  active: boolean;
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
  const payerKey = ["direct-squid-usdc-gas-payer", request?.owner] as const;
  const payerQuery = useQuery({
    enabled: active && isEligible && !!sourceClient,
    queryFn: () => {
      if (!request || !sourceClient) throw new Error("USDC network fees are unavailable");
      return checkUsdcGasPayer(sourceClient, request.owner);
    },
    queryKey: payerKey,
    retry: false,
  });
  const check = isEligible ? { payer: payerQuery.data, failed: payerQuery.isError } : undefined;
  const error = check?.failed
    ? `Network fees in USDC could not be estimated. ${walletErrorMessage(payerQuery.error, "")}`.trim()
    : null;

  // The reviewed deposit no longer holds: drop the check so Review waits for a fresh one.
  const reviewAgain = () => void queryClient.resetQueries({ queryKey: payerKey });

  const execute = async (input: ExecuteInput) => {
    if (!bundler || !sourceClient) throw new Error("USDC network fees are unavailable");
    const { owner } = input.request;
    return executePaymasterSquidDeposit({
      ...input,
      account: await toPaymasterAccount(sourceClient, owner),
      bundler,
      signAuthorization: (authorization) => signAuthorization(authorization, { address: owner }),
      sourceClient,
      squid,
    });
  };

  // Follows a pending deposit's operation to its bundle transaction and saves the marker with it.
  const waitForOperation = async (pending: PendingSquidDeposit, onSave: (pending: PendingSquidDeposit) => void) => {
    if (!bundler || !pending.userOperationHash) throw new Error("USDC network fees are unavailable");
    const transactionHash = await awaitPaymasterOperation(
      bundler,
      pending.userOperationHash,
      pending.owner,
      RESUME_RECEIPT_TIMEOUT_MS,
    );
    onSave({ ...pending, executionStage: "swap-broadcast", transactionHash });
    return transactionHash;
  };

  return {
    check,
    error,
    execute,
    isEligible,
    retry: () => void payerQuery.refetch(),
    reviewAgain,
    waitForOperation,
  };
}
