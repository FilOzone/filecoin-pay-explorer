import type {
  SourceToken,
  SquidFundingPlan,
  SquidPublicClient,
  SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import { useEffect, useRef, useState } from "react";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { mainnet } from "@/constants/chains";
import { getPlanNetworkGas } from "../data/guided-top-up";
import type { AcquiredSquidAcquisition, ProcessingSquidAcquisition } from "../data/squid-acquisition";
import { runSquidAcquisition } from "../data/squid-acquisition-flow";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { executeSquidTopUp, isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import { readUsdfcBalance } from "../data/usdfc-balance";
import type { SquidAcquisitionState } from "./useGuidedSquidAcquisition";
import type { SquidExecutionInputs } from "./useSquidSourceData";

export function useSquidExecution({
  acquisitionState,
  bridgeFeeMaximum,
  integratorId,
  isNativeSource,
  networkGasMaximum,
  onAcquired,
  onBlocked,
  onNetworkSwitchingChange,
  onRejected,
  onStarted,
  plan,
  refreshExecutionInputs,
  requiredNativeBalance,
  source,
  sourceChainName,
  sourceNativeCurrencySymbol,
}: {
  acquisitionState: SquidAcquisitionState;
  bridgeFeeMaximum: bigint;
  integratorId: string;
  isNativeSource: boolean;
  networkGasMaximum: bigint | null;
  onAcquired: (acquisition: AcquiredSquidAcquisition) => void;
  onBlocked: (acquisition: ProcessingSquidAcquisition) => void;
  onNetworkSwitchingChange: (isSwitching: boolean) => void;
  onRejected: () => void;
  onStarted: (acquisition: ProcessingSquidAcquisition) => void;
  plan?: SquidFundingPlan;
  refreshExecutionInputs: () => Promise<SquidExecutionInputs>;
  requiredNativeBalance: bigint;
  source?: SourceToken;
  sourceChainName?: string;
  sourceNativeCurrencySymbol?: string;
}) {
  const { address, chainId } = useAccount();
  const sourcePublicClient = usePublicClient({ chainId: source?.chainId });
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const { data: sourceWalletClient, isPending: isPreparingWallet } = useWalletClient();
  const { isPending: isSwitchingChain, switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const quote = plan?.quotes[0];

  useEffect(() => {
    if (chainId === source?.chainId) setSwitchError(null);
  }, [chainId, source?.chainId]);

  const switchToSourceNetwork = async () => {
    setError(null);
    setSwitchError(null);
    if (!source) return setError("Select a source network and token first.");
    onNetworkSwitchingChange(true);
    try {
      await switchChainAsync({ chainId: source.chainId });
    } catch (cause) {
      setSwitchError(
        isUserRejectedRequest(cause)
          ? "Network switch cancelled in your wallet."
          : walletErrorMessage(cause, `Could not switch your wallet to ${sourceChainName ?? "the source network"}.`),
      );
    } finally {
      onNetworkSwitchingChange(false);
    }
  };

  const acquire = async () => {
    setError(null);
    if (acquisitionState === "blocked")
      return setError("Check your source wallet activity before starting another acquisition.");
    if (acquisitionState !== "idle") return setError("This acquisition is already complete or in progress.");
    if (!address || !source || !plan || !quote) return setError("Review a route before acquiring USDFC.");
    if (chainId !== source.chainId)
      return setError("Switch your wallet to the selected source network before confirming.");
    if (!sourcePublicClient || !sourceWalletClient || !destinationClient)
      return setError("Wallet or network client is unavailable.");
    if (!sourceWalletClient.account || sourceWalletClient.account.address.toLowerCase() !== address.toLowerCase())
      return setError("Wallet account changed before confirming.");

    let executionInputs: SquidExecutionInputs;
    try {
      executionInputs = await refreshExecutionInputs();
    } catch (cause) {
      return setError(
        cause instanceof Error ? cause.message : "Could not refresh wallet balances. Try again before confirming.",
      );
    }
    if (quote.sourceAmount > executionInputs.sourceBalance)
      return setError(`Your ${source.symbol} balance no longer covers the quote. Refresh the quote.`);

    if (networkGasMaximum === 0n)
      return setError("The reviewed source-network gas maximum is unavailable. Refresh the quote.");
    if (networkGasMaximum === null) return setError("Your source-token allowance is still loading. Try again shortly.");
    if (!isNativeSource) {
      if (executionInputs.allowance === undefined)
        return setError("Could not refresh your source-token allowance. Try again before confirming.");
      if (getPlanNetworkGas(plan, executionInputs.allowance).maximum !== networkGasMaximum)
        return setError(
          "Your source-token allowance changed. Review the updated network-gas maximum before acquiring.",
        );
    }
    if (executionInputs.nativeBalance < requiredNativeBalance)
      return setError(
        `Your ${sourceNativeCurrencySymbol ?? "source-network native-token"} balance does not cover the reviewed maximum native requirement.`,
      );

    const publicClient =
      source.chainId === 10 || source.chainId === 8453
        ? {
            ...sourcePublicClient,
            estimateTotalFee: (request: Parameters<typeof estimateTotalFee>[1]) =>
              estimateTotalFee(sourcePublicClient, request),
          }
        : sourcePublicClient;
    const isCurrentOwner = () => latestAddress.current?.toLowerCase() === address.toLowerCase();
    try {
      const outcome = await withSquidAcquisitionLock(globalThis.navigator?.locks, address, () =>
        runSquidAcquisition({
          execute: ({ onSwapAttempt, onSwapBroadcast }) =>
            executeSquidTopUp({
              destinationClient: destinationClient as unknown as SquidPublicClient,
              integratorId,
              maxNativeFee: networkGasMaximum,
              maxTotalNativeRouteFee: bridgeFeeMaximum,
              onSwapAttempt,
              onSwapBroadcast,
              plan,
              sourcePublicClient: publicClient as unknown as SquidPublicClient,
              sourceWalletClient: sourceWalletClient as SquidWalletClient,
            }),
          minimumDestinationAmount: quote.requirement.amount,
          onStarted: (acquisition) => {
            if (isCurrentOwner()) onStarted(acquisition);
          },
          owner: address,
          readDestinationBalance: () => readUsdfcBalance(destinationClient, mainnet.contracts.usdfc.address, address),
          sourceChainId: source.chainId,
          storage: window.localStorage,
        }),
      );
      if (!isCurrentOwner()) return;
      if (outcome.status === "acquired") {
        onAcquired(outcome.acquisition);
        return;
      }
      if (outcome.status === "blocked") {
        onBlocked(outcome.acquisition);
      } else {
        onRejected();
      }
      setError(walletErrorMessage(outcome.error, "Squid could not complete the acquisition."));
    } catch (cause) {
      if (isCurrentOwner()) setError(walletErrorMessage(cause, "Squid could not start safely."));
    }
  };

  return {
    acquire,
    clearError: () => {
      setError(null);
      setSwitchError(null);
    },
    error,
    isPreparingWallet,
    isSwitchingChain,
    switchError,
    switchToSourceNetwork,
  };
}
