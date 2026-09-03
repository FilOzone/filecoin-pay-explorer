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

export type UseSquidExecutionOptions = {
  integratorId: string;
  lifecycle: {
    state: SquidAcquisitionState;
    onAcquired: (acquisition: AcquiredSquidAcquisition) => void;
    onBlocked: (acquisition: ProcessingSquidAcquisition) => void;
    onRejected: () => void;
    onStarted: (acquisition: ProcessingSquidAcquisition) => void;
  };
  onNetworkSwitchingChange: (isSwitching: boolean) => void;
  route: {
    bridgeFeeMaximum: bigint;
    networkGasMaximum: bigint | null;
    plan?: SquidFundingPlan;
    requiredNativeBalance: bigint;
  };
  source: {
    chainName?: string;
    isNative: boolean;
    nativeCurrencySymbol?: string;
    refreshExecutionInputs: () => Promise<SquidExecutionInputs>;
    token?: SourceToken;
  };
};

export function useSquidExecution({
  integratorId,
  lifecycle: { state: acquisitionState, onAcquired, onBlocked, onRejected, onStarted },
  onNetworkSwitchingChange,
  route: { bridgeFeeMaximum, networkGasMaximum, plan, requiredNativeBalance },
  source: {
    chainName: sourceChainName,
    isNative: isNativeSource,
    nativeCurrencySymbol: sourceNativeCurrencySymbol,
    refreshExecutionInputs,
    token: source,
  },
}: UseSquidExecutionOptions) {
  const { address, chainId } = useAccount();
  const sourcePublicClient = usePublicClient({ chainId: source?.chainId });
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const { data: sourceWalletClient, isPending: isPreparingWallet } = useWalletClient();
  const { isPending: isSwitchingChain, switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const [isPreparingAcquisition, setIsPreparingAcquisition] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const acquisitionInFlight = useRef(false);
  const quote = plan?.quotes[0];
  const latestExecutionContext = useRef({ address, chainId, plan, source });
  latestExecutionContext.current = { address, chainId, plan, source };

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
    if (acquisitionInFlight.current) return;
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

    const isCurrentExecution = () => {
      const current = latestExecutionContext.current;
      return (
        current.address?.toLowerCase() === address.toLowerCase() &&
        current.chainId === chainId &&
        current.plan === plan &&
        current.source?.chainId === source.chainId &&
        current.source.token.toLowerCase() === source.token.toLowerCase()
      );
    };
    acquisitionInFlight.current = true;
    setIsPreparingAcquisition(true);
    const finishAcquisition = () => {
      acquisitionInFlight.current = false;
      setIsPreparingAcquisition(false);
    };
    const failAcquisition = (message: string) => {
      finishAcquisition();
      setError(message);
    };

    let executionInputs: SquidExecutionInputs;
    try {
      executionInputs = await refreshExecutionInputs();
    } catch (cause) {
      finishAcquisition();
      if (isCurrentExecution())
        setError(
          cause instanceof Error ? cause.message : "Could not refresh wallet balances. Try again before confirming.",
        );
      return;
    }
    if (!isCurrentExecution()) {
      finishAcquisition();
      return;
    }
    if (quote.sourceAmount > executionInputs.sourceBalance)
      return failAcquisition(`Your ${source.symbol} balance no longer covers the quote. Refresh the quote.`);

    if (networkGasMaximum === 0n)
      return failAcquisition("The reviewed source-network gas maximum is unavailable. Refresh the quote.");
    if (networkGasMaximum === null)
      return failAcquisition("Your source-token allowance is still loading. Try again shortly.");
    if (!isNativeSource) {
      if (executionInputs.allowance === undefined)
        return failAcquisition("Could not refresh your source-token allowance. Try again before confirming.");
      if (getPlanNetworkGas(plan, executionInputs.allowance).maximum !== networkGasMaximum)
        return failAcquisition(
          "Your source-token allowance changed. Review the updated network-gas maximum before acquiring.",
        );
    }
    if (executionInputs.nativeBalance < requiredNativeBalance)
      return failAcquisition(
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
    try {
      const outcome = await withSquidAcquisitionLock(globalThis.navigator?.locks, address, () => {
        if (!isCurrentExecution()) return null;
        return runSquidAcquisition({
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
            if (isCurrentExecution()) onStarted(acquisition);
          },
          owner: address,
          readDestinationBalance: () => readUsdfcBalance(destinationClient, mainnet.contracts.usdfc.address, address),
          sourceChainId: source.chainId,
          storage: window.localStorage,
        });
      });
      if (!outcome || !isCurrentExecution()) return;
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
      if (isCurrentExecution()) setError(walletErrorMessage(cause, "Squid could not start safely."));
    } finally {
      finishAcquisition();
    }
  };

  return {
    acquire,
    clearError: () => {
      setError(null);
      setSwitchError(null);
    },
    error,
    isPreparingAcquisition,
    isPreparingWallet,
    isSwitchingChain,
    switchError,
    switchToSourceNetwork,
  };
}
