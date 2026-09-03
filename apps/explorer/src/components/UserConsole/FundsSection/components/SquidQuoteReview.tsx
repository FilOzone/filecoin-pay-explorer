"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import {
  fetchSourceTokens,
  NATIVE_TOKEN_ADDRESS,
  SQUID_ROUTER_ADDRESS,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { type Address, erc20Abi, formatUnits } from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatAddress } from "@/utils/formatter";
import { formatUsdfcAmount, USDFC_DECIMALS } from "../data/funding-runway";
import {
  formatNativeFee,
  getPlanBridgeNativeFees,
  getPlanNetworkGas,
  getRequiredNativeBalance,
  isBridgeNativeFee,
  shouldBlockOnSeparateNativeBalance,
} from "../data/guided-top-up";
import type { SquidAcquisition } from "../data/squid-acquisition";
import { runSquidAcquisition } from "../data/squid-acquisition-flow";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { executeSquidTopUp, isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import {
  FILECOIN_FIL_AMOUNT,
  FILECOIN_FIL_REQUIREMENT_ID,
  FILECOIN_USDFC_REQUIREMENT_ID,
  planSquidTopUp,
  squidFetch,
} from "../data/squid-quote";
import { readUsdfcBalance } from "../data/usdfc-balance";

const QUOTE_DEBOUNCE_MS = 500;

// Squid 429s recover slowly, so the quote fails fast with copy telling the
// user when to refresh; only the token catalog retries a burst.
const isRateLimited = (error: unknown) => error instanceof Error && error.message.includes("(429)");
const rateLimitRetry = (failureCount: number, error: unknown) => isRateLimited(error) && failureCount < 2;
const rateLimitRetryDelay = (failureCount: number) => 15_000 * (failureCount + 1);

type SearchableOption = {
  aliases?: readonly string[];
  label: string;
  value: string;
};

const SOURCE_CHAIN_OPTIONS: readonly SearchableOption[] = SQUID_SOURCE_CHAINS.map((chain) => ({
  label: chain.name,
  value: String(chain.id),
}));

type SquidQuoteReviewProps = {
  acquisitionState: "acquired" | "blocked" | "idle" | "processing";
  completedRequirementIds?: readonly string[];
  destinationAmount: bigint | null;
  onAcquired: (acquisition: SquidAcquisition) => void;
  onAcquisitionStateChange: (state: "acquired" | "blocked" | "idle" | "processing") => void;
  onAcquisitionSaved: (acquisition: SquidAcquisition) => void;
  onNetworkSwitchingChange: (isSwitching: boolean) => void;
};

function displayAmount(amount: bigint, decimals: number, symbol: string) {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}

export function sourceTokenCatalogMessage(isConfigured: boolean, hasError: boolean) {
  if (!isConfigured) return "Squid funding is not configured for this deployment.";
  if (hasError) return "Could not load tokens from Squid. Check the configuration or try again.";
  return "No supported tokens on this network.";
}

export function nativeTokenFirst<T extends { token: string }>(tokens: readonly T[]): T[] {
  const nativeAddress = NATIVE_TOKEN_ADDRESS.toLowerCase();
  return [...tokens].sort(
    (left, right) =>
      Number(right.token.toLowerCase() === nativeAddress) - Number(left.token.toLowerCase() === nativeAddress),
  );
}

export function excludeDestinationUsdfc<T extends { token: string }>(tokens: readonly T[], sourceChainId: number) {
  return sourceChainId === mainnet.id
    ? tokens.filter((token) => token.token.toLowerCase() !== mainnet.contracts.usdfc.address.toLowerCase())
    : [...tokens];
}

export function shouldIncludeFilForFees(balance: bigint | undefined, hasError: boolean) {
  return hasError || balance === undefined || balance === 0n;
}

export function totalQuotedSourceAmount(quotes: readonly { sourceAmount: bigint }[]) {
  return quotes.reduce((total, quote) => total + quote.sourceAmount, 0n);
}

export function resolveSearchableOption(options: readonly SearchableOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const labelMatch = options.find((option) => option.label.toLowerCase() === normalizedQuery);
  if (labelMatch) return labelMatch.value;

  const aliasMatches = options.filter((option) =>
    option.aliases?.some((alias) => alias.toLowerCase() === normalizedQuery),
  );
  return aliasMatches.length === 1 ? aliasMatches[0].value : "";
}

export function SquidQuoteReview({
  acquisitionState,
  completedRequirementIds = [],
  destinationAmount,
  onAcquired,
  onAcquisitionSaved,
  onAcquisitionStateChange,
  onNetworkSwitchingChange,
}: SquidQuoteReviewProps) {
  // The flow is deliberately split into read-only route review and wallet execution.
  // Any execution that may have broadcast remains blocked until it is recovered or explicitly cleared.
  const { address, chainId } = useAccount();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [sourceChainQuery, setSourceChainQuery] = useState("");
  const [sourceChainQueryTouched, setSourceChainQueryTouched] = useState(false);
  const [sourceTokenQuery, setSourceTokenQuery] = useState("");
  const [sourceTokenQueryTouched, setSourceTokenQueryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [includeFilOverride, setIncludeFilOverride] = useState<{ owner: Address; value: boolean } | null>(null);
  const sourceChainListId = useId();
  const sourceTokenListId = useId();
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const [debouncedDestinationAmount] = useDebounce(destinationAmount, QUOTE_DEBOUNCE_MS);
  const sourceChain = Number(sourceChainId);
  const sourcePublicClient = usePublicClient({ chainId: sourceChain || undefined });
  // Follow the connected chain so switching networks refreshes a wallet-client
  // query that may previously have failed because the selected chain differed.
  const { data: sourceWalletClient, isPending: isPreparingWallet } = useWalletClient();
  const { isPending: isSwitchingChain, switchChainAsync } = useSwitchChain();
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const integratorId =
    process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() || "filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862";
  const quotesUnavailable = integratorId === "";
  const sourceChainMeta = SQUID_SOURCE_CHAINS.find((chain) => chain.id === sourceChain);
  const {
    data: tokens = [],
    error: tokenLoadError,
    isError: isTokenLoadError,
    isFetching: isLoadingTokens,
    refetch: refetchTokens,
  } = useQuery({
    enabled: !quotesUnavailable && SQUID_SOURCE_CHAINS.some((chain) => chain.id === sourceChain),
    queryFn: () => fetchSourceTokens(sourceChain, { fetch: squidFetch, integratorId }),
    queryKey: ["squid", "source-tokens", sourceChain],
    retry: rateLimitRetry,
    retryDelay: rateLimitRetryDelay,
    staleTime: 300_000,
  });
  const tokenLoadFailed = isTokenLoadError && tokens.length === 0;
  const selectableTokens = excludeDestinationUsdfc(tokens, sourceChain);
  const sourceTokenOptions: readonly SearchableOption[] = nativeTokenFirst(selectableTokens).map((token) => ({
    aliases: [token.symbol, token.token],
    label: `${token.symbol} (${formatAddress(token.token)})`,
    value: token.token,
  }));
  const sourceChainQueryInvalid = sourceChainQueryTouched && sourceChainQuery.trim() !== "" && sourceChainId === "";
  const sourceTokenQueryInvalid =
    sourceTokenQueryTouched && sourceTokenQuery.trim() !== "" && sourceTokenAddress === "";
  const source = selectableTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const isBusy = acquisitionState !== "idle";
  const isNativeSource = source?.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const isFilecoinFilSource = isNativeSource && source?.chainId === mainnet.id;
  const isQuoteDebouncing = destinationAmount !== debouncedDestinationAmount;
  const {
    data: filecoinFilBalance,
    isError: isFilecoinFilBalanceError,
    isFetching: isLoadingFilecoinFilBalance,
    refetch: refetchFilecoinFilBalance,
  } = useQuery({
    enabled: !!address && !!destinationClient,
    queryFn: async () => {
      if (!destinationClient || !address) throw new Error("Filecoin balance client is unavailable");
      return destinationClient.getBalance({ address });
    },
    queryKey: ["squid", "filecoin-fil-balance", mainnet.id, address],
  });
  const currentIncludeFilOverride =
    includeFilOverride && includeFilOverride.owner.toLowerCase() === address?.toLowerCase()
      ? includeFilOverride.value
      : null;
  const hasCompletedFilRequirement = completedRequirementIds.includes(FILECOIN_FIL_REQUIREMENT_ID);
  const includeFil = hasCompletedFilRequirement
    ? false
    : (currentIncludeFilOverride ?? shouldIncludeFilForFees(filecoinFilBalance, isFilecoinFilBalanceError));
  const isFilecoinFilBalanceResolved =
    hasCompletedFilRequirement ||
    currentIncludeFilOverride !== null ||
    filecoinFilBalance !== undefined ||
    isFilecoinFilBalanceError;
  const nativeBalanceFloor = isFilecoinFilSource ? FILECOIN_FIL_AMOUNT : 0n;
  const {
    data: sourceBalance,
    isError: isSourceBalanceError,
    isFetching: isLoadingSourceBalance,
    refetch: refetchSourceBalance,
  } = useQuery({
    enabled: !!address && !!source && !!sourcePublicClient,
    queryFn: async () => {
      if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
      if (source.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
        return sourcePublicClient.getBalance({ address });
      }
      return sourcePublicClient.readContract({
        abi: erc20Abi,
        address: source.token,
        args: [address],
        functionName: "balanceOf",
      });
    },
    queryKey: ["squid", "source-balance", sourceChain, sourceTokenAddress, address],
  });
  const {
    data: separateNativeBalance,
    isError: isNativeBalanceError,
    isFetching: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useQuery({
    enabled: !!address && !!source && !isNativeSource && !!sourcePublicClient,
    queryFn: async () => {
      if (!sourcePublicClient || !address) throw new Error("Source network client is unavailable");
      return sourcePublicClient.getBalance({ address });
    },
    queryKey: ["squid", "native-balance", sourceChain, address],
  });
  const {
    data: sourceAllowance,
    isError: isSourceAllowanceError,
    isFetching: isLoadingSourceAllowance,
    refetch: refetchSourceAllowance,
  } = useQuery({
    enabled: !!address && !!source && !isNativeSource && !!sourcePublicClient,
    queryFn: async () => {
      if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
      return sourcePublicClient.readContract({
        abi: erc20Abi,
        address: source.token,
        args: [address, SQUID_ROUTER_ADDRESS],
        functionName: "allowance",
      });
    },
    queryKey: ["squid", "source-allowance", sourceChain, sourceTokenAddress, address, SQUID_ROUTER_ADDRESS],
  });
  const sourceAmount = sourceBalance ?? null;
  const nativeBalance = isNativeSource ? sourceBalance : separateNativeBalance;
  const insufficientBalance =
    source && debouncedDestinationAmount !== null
      ? `You don't have enough ${source.symbol} to receive ${formatUsdfcAmount(debouncedDestinationAmount)} USDFC.`
      : null;
  const {
    data: quotedPlan,
    error: quoteError,
    isFetching: isReviewing,
    refetch: refetchQuote,
  } = useQuery({
    enabled:
      !quotesUnavailable &&
      !isBusy &&
      !isQuoteDebouncing &&
      isFilecoinFilBalanceResolved &&
      !!address &&
      !!source &&
      debouncedDestinationAmount !== null &&
      debouncedDestinationAmount > 0n &&
      sourceAmount !== null &&
      sourceAmount > 0n,
    queryFn: async () => {
      if (!address || !source || debouncedDestinationAmount === null || sourceAmount === null) {
        throw new Error("Select a source token and enter the USDFC amount.");
      }
      return planSquidTopUp({
        destinationAmount: debouncedDestinationAmount,
        destinationToken: mainnet.contracts.usdfc.address,
        includeFil,
        integratorId,
        owner: address,
        source,
        sourceAmount,
      });
    },
    queryKey: [
      "squid",
      "top-up-plan",
      address,
      mainnet.contracts.usdfc.address,
      debouncedDestinationAmount?.toString() ?? "",
      includeFil,
      sourceChain,
      sourceTokenAddress,
      sourceAmount?.toString() ?? "",
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });
  const plan = isQuoteDebouncing ? undefined : quotedPlan;
  const quote = plan?.quotes.find((item) => item.requirement.id === FILECOIN_USDFC_REQUIREMENT_ID);
  const filQuote = plan?.quotes.find((item) => item.requirement.id === FILECOIN_FIL_REQUIREMENT_ID);
  const totalSourceAmount = plan ? totalQuotedSourceAmount(plan.quotes) : 0n;
  const quoteCosts = plan?.quotes.flatMap((item) => item.costs) ?? [];
  const bridgeNativeFees = plan ? getPlanBridgeNativeFees(plan) : { estimated: 0n, maximum: 0n };
  const bridgeFeeLabel = sourceChainMeta
    ? formatNativeFee(bridgeNativeFees.estimated, sourceChainMeta.nativeCurrency)
    : null;
  const maximumBridgeFeeLabel = sourceChainMeta
    ? formatNativeFee(bridgeNativeFees.maximum, sourceChainMeta.nativeCurrency)
    : null;
  const networkGas = plan
    ? getPlanNetworkGas(plan, isNativeSource ? undefined : sourceAllowance)
    : { estimated: 0n, maximum: null, transactionCount: null };
  const estimatedNetworkFeeLabel = sourceChainMeta
    ? formatNativeFee(networkGas.estimated, sourceChainMeta.nativeCurrency)
    : null;
  const maximumNetworkFeeLabel =
    sourceChainMeta && networkGas.maximum !== null
      ? formatNativeFee(networkGas.maximum, sourceChainMeta.nativeCurrency)
      : null;
  const requiredNativeBalance =
    plan && networkGas.maximum !== null ? getRequiredNativeBalance(plan, networkGas.maximum, nativeBalanceFloor) : 0n;
  const approvalTransactionCount =
    plan && networkGas.transactionCount !== null ? networkGas.transactionCount - plan.quotes.length : null;
  const requiredNativeBalanceLabel = sourceChainMeta
    ? formatNativeFee(requiredNativeBalance, sourceChainMeta.nativeCurrency)
    : null;
  const otherSquidFeeCosts = quoteCosts.filter(
    (cost) => cost.kind === "fee" && (!sourceChainMeta || !isBridgeNativeFee(cost, sourceChainMeta.id)),
  );
  const otherNetworkGasCosts = quoteCosts.filter(
    (cost) =>
      cost.kind === "gas" &&
      (!sourceChainMeta ||
        cost.token.chainId !== sourceChainMeta.id ||
        cost.token.address?.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()),
  );
  const isSeparateNativeBalanceBlocked = shouldBlockOnSeparateNativeBalance(
    isNativeSource === true,
    isNativeBalanceError,
    isLoadingNativeBalance,
  );
  const isSourceAllowanceBlocked =
    source !== undefined &&
    !isNativeSource &&
    (isSourceAllowanceError || isLoadingSourceAllowance || sourceAllowance === undefined);
  const nativeBalanceBlockedMessage =
    plan && networkGas.maximum === 0n
      ? "Squid did not provide a source-network gas estimate. Refresh the quote before acquiring."
      : plan && nativeBalance !== undefined && nativeBalance < requiredNativeBalance && sourceChainMeta
        ? `Your ${sourceChainMeta.nativeCurrency.symbol} balance does not cover the reviewed maximum native requirement.`
        : null;
  const quoteErrorMessage =
    !isQuoteDebouncing && quoteError
      ? quoteError instanceof Error && quoteError.message.includes("exceed the source-token cap")
        ? insufficientBalance
        : isRateLimited(quoteError)
          ? "Squid is rate-limiting quote requests. Wait a moment, then refresh the estimate."
          : quoteError instanceof Error
            ? quoteError.message
            : "Squid could not provide a route."
      : null;
  // A zero spend cap never reaches the planner (query disabled), so surface it without a click.
  const capBlockedMessage =
    !isQuoteDebouncing &&
    debouncedDestinationAmount !== null &&
    debouncedDestinationAmount > 0n &&
    sourceAmount !== null &&
    sourceAmount <= 0n
      ? insufficientBalance
      : null;

  useEffect(() => {
    if (tokenLoadError) console.error("Failed to load Squid token catalog:", tokenLoadError);
  }, [tokenLoadError]);

  useEffect(() => {
    if (chainId === sourceChain) {
      setSwitchError(null);
    }
  }, [chainId, sourceChain]);

  const review = () => {
    setError(null);
    if (quotesUnavailable) return setError("Squid quotes are not configured for this deployment.");
    if (!address || !source || destinationAmount === null)
      return setError("Select a source token and enter the USDFC amount.");
    if (isSourceBalanceError) return setError("Could not load your source-token balance. Retry the balance read.");
    if (sourceBalance === undefined) return setError("Your source-token balance is still loading. Try again shortly.");
    if (sourceAmount === null || sourceAmount <= 0n) return setError(insufficientBalance);
    void refetchQuote();
  };

  const switchToSourceNetwork = async () => {
    setError(null);
    setSwitchError(null);
    if (!source || !sourceChainMeta) return setError("Select a source network and token first.");
    onNetworkSwitchingChange(true);
    try {
      await switchChainAsync({ chainId: source.chainId });
    } catch (switchError) {
      setSwitchError(
        isUserRejectedRequest(switchError)
          ? "Network switch cancelled in your wallet."
          : walletErrorMessage(switchError, `Could not switch your wallet to ${sourceChainMeta.name}.`),
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
    if (!address || !source || !plan || !quote || destinationAmount === null)
      return setError("Review a route before acquiring USDFC.");
    if (chainId !== source.chainId)
      return setError("Switch your wallet to the selected source network before confirming.");
    if (!sourcePublicClient || !sourceWalletClient || !destinationClient)
      return setError("Wallet or network client is unavailable.");
    if (!sourceWalletClient.account || sourceWalletClient.account.address.toLowerCase() !== address.toLowerCase())
      return setError("Wallet account changed before confirming.");
    const latestBalanceResult = await refetchSourceBalance();
    if (latestBalanceResult.isError || latestBalanceResult.data === undefined) {
      return setError("Could not refresh your source-token balance. Try again before confirming.");
    }
    if (totalSourceAmount > latestBalanceResult.data) {
      return setError(`Your ${source.symbol} balance no longer covers the quote. Refresh the quote.`);
    }
    const latestNativeBalanceResult = isNativeSource ? latestBalanceResult : await refetchNativeBalance();
    if (latestNativeBalanceResult.isError || latestNativeBalanceResult.data === undefined) {
      return setError("Could not refresh your source-network gas balance. Try again before confirming.");
    }
    if (networkGas.maximum === 0n) {
      return setError("The reviewed source-network gas maximum is unavailable. Refresh the quote.");
    }
    if (networkGas.maximum === null) {
      return setError("Your source-token allowance is still loading. Try again shortly.");
    }
    const reviewedNetworkGasMaximum = networkGas.maximum;
    if (!isNativeSource) {
      const latestAllowanceResult = await refetchSourceAllowance();
      if (latestAllowanceResult.isError || latestAllowanceResult.data === undefined) {
        return setError("Could not refresh your source-token allowance. Try again before confirming.");
      }
      const latestNetworkGas = getPlanNetworkGas(plan, latestAllowanceResult.data);
      if (latestNetworkGas.maximum !== reviewedNetworkGasMaximum) {
        return setError(
          "Your source-token allowance changed. Review the updated network-gas maximum before acquiring.",
        );
      }
    }
    if (latestNativeBalanceResult.data < requiredNativeBalance) {
      return setError(
        `Your ${sourceChainMeta?.nativeCurrency.symbol ?? "native-token"} balance does not cover the reviewed maximum native requirement.`,
      );
    }

    const publicClient =
      source.chainId === 10 || source.chainId === 8453
        ? {
            ...sourcePublicClient,
            estimateTotalFee: (request: Parameters<typeof estimateTotalFee>[1]) =>
              estimateTotalFee(sourcePublicClient, request),
          }
        : sourcePublicClient;
    const isCurrentExecutionOwner = () => latestAddress.current?.toLowerCase() === address.toLowerCase();
    try {
      const outcome = await withSquidAcquisitionLock(globalThis.navigator?.locks, address, () =>
        runSquidAcquisition({
          execute: ({ completedRequirementIds, onIntermediateRouteComplete, onSwapAttempt, onSwapBroadcast }) =>
            executeSquidTopUp({
              completedRequirementIds,
              destinationClient: destinationClient as unknown as SquidPublicClient,
              integratorId,
              maxNativeFee: reviewedNetworkGasMaximum,
              maxTotalNativeRouteFee: bridgeNativeFees.maximum,
              nativeBalanceFloor,
              onIntermediateRouteComplete: async (requirementId) => {
                onIntermediateRouteComplete(requirementId);
                setIncludeFilOverride({ owner: address, value: false });
                await Promise.all([refetchFilecoinFilBalance(), refetchSourceBalance()]);
              },
              onSwapAttempt,
              onSwapBroadcast,
              plan,
              sourcePublicClient: publicClient as unknown as SquidPublicClient,
              sourceWalletClient: sourceWalletClient as SquidWalletClient,
            }),
          minimumDestinationAmount: quote.requirement.amount,
          onCheckpoint: onAcquisitionSaved,
          onStarted: () => {
            if (isCurrentExecutionOwner()) onAcquisitionStateChange("processing");
          },
          owner: address,
          readDestinationBalance: () => readUsdfcBalance(destinationClient, mainnet.contracts.usdfc.address, address),
          sourceChainId: source.chainId,
          storage: window.localStorage,
        }),
      );
      if (!isCurrentExecutionOwner()) return;
      if (outcome.status === "acquired") {
        onAcquisitionStateChange("acquired");
        onAcquired(outcome.acquisition);
        return;
      }
      if (outcome.status === "blocked") {
        onAcquisitionSaved(outcome.acquisition);
        onAcquisitionStateChange("blocked");
      } else {
        onAcquisitionStateChange("idle");
      }
      setError(walletErrorMessage(outcome.error, "Squid could not complete the acquisition."));
    } catch (executionError) {
      if (isCurrentExecutionOwner()) setError(walletErrorMessage(executionError, "Squid could not start safely."));
    }
  };

  return (
    <section aria-label='Swap quote review' className='grid gap-3 rounded-md border p-3 text-sm'>
      <p className='text-xs text-muted-foreground'>
        Supported via{" "}
        <a
          className='underline underline-offset-2'
          href='https://app.squidrouter.com/'
          rel='noopener noreferrer'
          target='_blank'
        >
          Squid
        </a>
      </p>

      {quotesUnavailable && (
        <p className='rounded-md bg-muted/50 p-2 text-muted-foreground'>{sourceTokenCatalogMessage(false, false)}</p>
      )}

      <div className='grid gap-1'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor='squid-source-network'>Source network</Label>
          {sourceChain === chainId && (
            <span
              aria-live='polite'
              className='text-xs text-muted-foreground'
              id='squid-source-network-status'
              role='status'
            >
              Connected
            </span>
          )}
        </div>
        <Input
          aria-describedby={
            [
              sourceChain === chainId ? "squid-source-network-status" : "",
              sourceChainQueryInvalid ? "squid-source-network-error" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={sourceChainQueryInvalid}
          autoComplete='off'
          disabled={isBusy}
          id='squid-source-network'
          list={sourceChainListId}
          onBlur={() => setSourceChainQueryTouched(true)}
          onChange={(value) => {
            setError(null);
            setSwitchError(null);
            setSourceChainQuery(value);
            setSourceChainQueryTouched(false);
            const nextSourceChainId = resolveSearchableOption(SOURCE_CHAIN_OPTIONS, value);
            if (nextSourceChainId !== sourceChainId) {
              setSourceChainId(nextSourceChainId);
              setSourceTokenAddress("");
              setSourceTokenQuery("");
              setSourceTokenQueryTouched(false);
            }
          }}
          placeholder='Search networks'
          type='search'
          value={sourceChainQuery}
        />
        <datalist id={sourceChainListId}>
          {SOURCE_CHAIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.label} />
          ))}
        </datalist>
        {sourceChainQueryInvalid && (
          <p className='text-xs text-destructive' id='squid-source-network-error'>
            Choose a source network from the suggestions.
          </p>
        )}
      </div>

      <div className='grid gap-1'>
        <Label htmlFor='squid-source-token'>Source token</Label>
        <Input
          aria-describedby={
            [
              source && !isSourceBalanceError ? "squid-source-token-balance" : "",
              sourceTokenQueryInvalid ? "squid-source-token-error" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={sourceTokenQueryInvalid}
          autoComplete='off'
          disabled={isBusy || quotesUnavailable || sourceChainId === "" || isLoadingTokens || tokenLoadFailed}
          id='squid-source-token'
          list={sourceTokenListId}
          onBlur={() => setSourceTokenQueryTouched(true)}
          onChange={(value) => {
            setError(null);
            setSourceTokenQuery(value);
            setSourceTokenQueryTouched(false);
            setSourceTokenAddress(resolveSearchableOption(sourceTokenOptions, value));
          }}
          placeholder={isLoadingTokens ? "Loading tokens…" : "Search tokens"}
          type='search'
          value={sourceTokenQuery}
        />
        <datalist id={sourceTokenListId}>
          {sourceTokenOptions.map((option) => (
            <option key={option.value} value={option.label} />
          ))}
        </datalist>
        {sourceTokenQueryInvalid && (
          <p className='text-xs text-destructive' id='squid-source-token-error'>
            Choose a source token from the suggestions.
          </p>
        )}
        {sourceChainId !== "" && !quotesUnavailable && tokens.length === 0 && !isLoadingTokens && !tokenLoadFailed && (
          <p className='text-sm text-muted-foreground'>
            {sourceTokenCatalogMessage(!quotesUnavailable, isTokenLoadError)}
          </p>
        )}
        {tokenLoadFailed && (
          <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
            <span>{sourceTokenCatalogMessage(true, true)}</span>
            <Button
              disabled={isLoadingTokens}
              onClick={() => void refetchTokens()}
              size='compact'
              type='button'
              variant='tertiary'
            >
              Retry
            </Button>
          </div>
        )}
        {source && !isNativeSource && (
          <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
            <span>Token address</span>
            <span className='flex items-center font-mono'>
              {formatAddress(source.token)}
              <CopyButton
                successMessage={`${source.symbol} token address copied`}
                tooltipText={`Copy ${source.symbol} token address`}
                value={source.token}
              />
            </span>
          </div>
        )}
        {source && !isSourceBalanceError && (
          <div
            aria-live='polite'
            className='flex items-center justify-between gap-2 text-xs text-muted-foreground'
            id='squid-source-token-balance'
            role='status'
          >
            <span>Balance</span>
            <span>
              {isLoadingSourceBalance || sourceBalance === undefined
                ? "Loading…"
                : displayAmount(sourceBalance, source.decimals, source.symbol)}
            </span>
          </div>
        )}
        {isSourceBalanceError && (
          <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
            <span>Could not load your source-token balance.</span>
            <Button
              disabled={isLoadingSourceBalance}
              onClick={() => {
                setError(null);
                void refetchSourceBalance();
              }}
              size='compact'
              type='button'
              variant='tertiary'
            >
              {isLoadingSourceBalance ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
        {source && !isNativeSource && !isNativeBalanceError && sourceChainMeta && (
          <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
            <span>Network fee balance</span>
            <span>
              {isLoadingNativeBalance || nativeBalance === undefined
                ? "Loading…"
                : displayAmount(
                    nativeBalance,
                    sourceChainMeta.nativeCurrency.decimals,
                    sourceChainMeta.nativeCurrency.symbol,
                  )}
            </span>
          </div>
        )}
        {source && !isNativeSource && isNativeBalanceError && (
          <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
            <span>Could not load your source-network gas balance.</span>
            <Button
              disabled={isLoadingNativeBalance}
              onClick={() => {
                setError(null);
                void refetchNativeBalance();
              }}
              size='compact'
              type='button'
              variant='tertiary'
            >
              {isLoadingNativeBalance ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
        {source && !isNativeSource && !isSourceAllowanceError && (
          <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
            <span>Squid approval</span>
            <span>
              {isLoadingSourceAllowance || sourceAllowance === undefined
                ? "Loading…"
                : approvalTransactionCount === null
                  ? "Waiting for quote"
                  : approvalTransactionCount === 0
                    ? "No approval needed"
                    : approvalTransactionCount === 1
                      ? "Approval required"
                      : `${approvalTransactionCount} approval transactions expected`}
            </span>
          </div>
        )}
        {source && !isNativeSource && isSourceAllowanceError && (
          <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
            <span>Could not load your Squid token allowance.</span>
            <Button
              disabled={isLoadingSourceAllowance}
              onClick={() => {
                setError(null);
                void refetchSourceAllowance();
              }}
              size='compact'
              type='button'
              variant='tertiary'
            >
              {isLoadingSourceAllowance ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
      </div>

      <div className='flex items-start gap-2 rounded-md bg-muted/50 p-3'>
        <input
          aria-describedby='squid-include-fil-hint'
          checked={includeFil}
          className='mt-0.5 h-4 w-4 shrink-0 accent-primary'
          disabled={isBusy || hasCompletedFilRequirement}
          id='squid-include-fil'
          onChange={(event) => {
            setError(null);
            if (address) setIncludeFilOverride({ owner: address, value: event.currentTarget.checked });
          }}
          type='checkbox'
        />
        <div className='grid gap-1'>
          <Label className='cursor-pointer' htmlFor='squid-include-fil'>
            Add 0.25 FIL for transaction fees
          </Label>
          <p className='text-xs leading-relaxed text-muted-foreground' id='squid-include-fil-hint'>
            {hasCompletedFilRequirement
              ? "FIL was already added in this acquisition."
              : isFilecoinFilBalanceError
                ? includeFil
                  ? "Your FIL balance could not be read, so this is included by default."
                  : "Your FIL balance could not be read. FIL is not included."
                : filecoinFilBalance !== undefined && filecoinFilBalance > 0n
                  ? "You already have FIL for fees."
                  : isLoadingFilecoinFilBalance
                    ? "Checking your Filecoin wallet balance…"
                    : "Add FIL to your wallet so you can deposit USDFC and make other Filecoin transactions."}
          </p>
        </div>
      </div>

      <Button
        disabled={
          !source ||
          destinationAmount === null ||
          isBusy ||
          isReviewing ||
          isQuoteDebouncing ||
          isSourceBalanceError ||
          isLoadingSourceBalance ||
          sourceBalance === undefined
        }
        onClick={review}
        size='compact'
        type='button'
        variant='tertiary'
      >
        {isReviewing ? (
          <span className='inline-flex items-center gap-2'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Fetching quote…
          </span>
        ) : plan ? (
          "Refresh quote"
        ) : (
          "Get estimate"
        )}
      </Button>

      {(error || switchError || quoteErrorMessage || capBlockedMessage || nativeBalanceBlockedMessage) && (
        <div className='flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-destructive' role='alert'>
          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
          <span>{error || switchError || quoteErrorMessage || capBlockedMessage || nativeBalanceBlockedMessage}</span>
        </div>
      )}

      {quote && plan && (
        <div className='grid gap-2 border-t pt-3'>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
            <span className='text-muted-foreground'>Spend (estimated)</span>
            <span className='text-right font-medium'>
              {displayAmount(totalSourceAmount, plan.source.decimals, plan.source.symbol)}
            </span>
            <span className='text-muted-foreground'>Estimated received</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.destinationAmount, USDFC_DECIMALS, "USDFC")}
            </span>
            <span className='text-muted-foreground'>Execution minimum</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.requirement.amount, USDFC_DECIMALS, "USDFC")}
            </span>
            {(includeFil || isFilecoinFilSource) && (
              <>
                <span className='text-muted-foreground'>
                  {isFilecoinFilSource ? "Wallet FIL reserve" : "+ network fees (FIL)"}
                </span>
                <span className='text-right font-medium'>
                  {filQuote ? displayAmount(filQuote.requirement.amount, 18, "FIL") : "0.25 FIL kept in your wallet"}
                </span>
              </>
            )}
            <span className='text-muted-foreground'>Slippage</span>
            <span className='text-right font-medium'>1%</span>
            {bridgeFeeLabel && maximumBridgeFeeLabel && (
              <>
                <span className='text-muted-foreground'>Bridge fee (estimated)</span>
                <span className='text-right font-medium'>{bridgeFeeLabel}</span>
                <span className='text-muted-foreground'>Bridge fee maximum</span>
                <span className='text-right font-medium'>{maximumBridgeFeeLabel}</span>
              </>
            )}
            {otherSquidFeeCosts.length > 0 && (
              <>
                <span className='text-muted-foreground'>Other Squid fees (estimated)</span>
                <span className='text-right font-medium'>
                  {otherSquidFeeCosts
                    .map((cost) => displayAmount(cost.amount, cost.token.decimals, cost.token.symbol))
                    .join(", ")}
                </span>
              </>
            )}
            {estimatedNetworkFeeLabel && maximumNetworkFeeLabel && networkGas.transactionCount !== null && (
              <>
                <span className='text-muted-foreground'>Source-network gas (estimated)</span>
                <span className='text-right font-medium'>{estimatedNetworkFeeLabel}</span>
                <span className='text-muted-foreground'>Source-network gas maximum</span>
                <span className='text-right font-medium'>{maximumNetworkFeeLabel}</span>
                <span className='text-muted-foreground'>Expected source transactions</span>
                <span className='text-right font-medium'>{networkGas.transactionCount}</span>
              </>
            )}
            {otherNetworkGasCosts.length > 0 && (
              <>
                <span className='text-muted-foreground'>Other network gas (estimated)</span>
                <span className='text-right font-medium'>
                  {otherNetworkGasCosts
                    .map((cost) => displayAmount(cost.amount, cost.token.decimals, cost.token.symbol))
                    .join(", ")}
                </span>
              </>
            )}
            {requiredNativeBalanceLabel && (
              <>
                <span className='text-muted-foreground'>Maximum native balance required</span>
                <span className='text-right font-medium'>{requiredNativeBalanceLabel}</span>
              </>
            )}
          </div>
          {maximumBridgeFeeLabel && maximumNetworkFeeLabel && (
            <p className='text-xs text-muted-foreground'>
              The route is refreshed before signing. Execution stops if its cumulative bridge fee exceeds the reviewed
              bridge maximum or if cumulative prepared source-network gas exceeds the separate gas maximum.
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            Route: {quote.actions.map((action) => action.description ?? action.type).join(" → ")}
          </p>

          <Button
            disabled={
              isBusy ||
              isSwitchingChain ||
              isSourceAllowanceBlocked ||
              isSeparateNativeBalanceBlocked ||
              nativeBalance === undefined ||
              networkGas.maximum === null ||
              networkGas.maximum === 0n ||
              nativeBalance < requiredNativeBalance ||
              (chainId === sourceChain && isPreparingWallet)
            }
            onClick={chainId === sourceChain ? acquire : switchToSourceNetwork}
            size='compact'
            type='button'
            variant='primary'
          >
            {isSwitchingChain ? (
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Switching network…
              </span>
            ) : chainId !== sourceChain ? (
              `Switch wallet to ${sourceChainMeta?.name ?? "source network"}`
            ) : isPreparingWallet ? (
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Preparing wallet…
              </span>
            ) : acquisitionState === "processing" ? (
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Acquiring USDFC{includeFil ? " + FIL" : ""}…
              </span>
            ) : filQuote ? (
              "Swap for USDFC + FIL"
            ) : (
              "Swap for USDFC"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
