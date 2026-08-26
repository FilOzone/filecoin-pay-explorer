"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import {
  fetchSourceTokens,
  NATIVE_TOKEN_ADDRESS,
  SQUID_ROUTER_ADDRESS,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { erc20Abi, formatUnits } from "viem";
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
import {
  hasUnknownSourceTokenBalances,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalance,
  sourceTokenBalancesQueryKey,
  visibleSourceTokens,
} from "../data/source-token-balances";
import type { SquidAcquisition } from "../data/squid-acquisition";
import { runSquidAcquisition } from "../data/squid-acquisition-flow";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import { executeSquidTopUp, isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import { planSquidTopUp, squidFetch } from "../data/squid-quote";
import { readUsdfcBalance } from "../data/usdfc-balance";
import { type SearchableOption, SearchableSelect } from "./SearchableSelect";

const QUOTE_DEBOUNCE_MS = 500;

// Squid 429s recover slowly, so the quote fails fast with copy telling the
// user when to refresh; only the token catalog retries a burst.
const isRateLimited = (error: unknown) => error instanceof Error && error.message.includes("(429)");
const rateLimitRetry = (failureCount: number, error: unknown) => isRateLimited(error) && failureCount < 2;
const rateLimitRetryDelay = (failureCount: number) => 15_000 * (failureCount + 1);

const SOURCE_CHAIN_OPTIONS: readonly SearchableOption[] = SQUID_SOURCE_CHAINS.map((chain) => ({
  label: chain.name,
  value: String(chain.id),
}));

type SquidQuoteReviewProps = {
  acquisitionState: "acquired" | "blocked" | "idle" | "processing";
  destinationAmount: bigint | null;
  onAcquired: (acquisition: SquidAcquisition) => void;
  onAcquisitionStateChange: (state: "acquired" | "blocked" | "idle" | "processing") => void;
  onBlocked: (acquisition: SquidAcquisition) => void;
  onNetworkSwitchingChange: (isSwitching: boolean) => void;
};

function displayAmount(amount: bigint, decimals: number, symbol: string) {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}

export function SquidQuoteSummary({
  isNativeSource,
  maximumRequirement,
  pay,
  receive,
}: {
  isNativeSource: boolean;
  maximumRequirement: string | null;
  pay: string;
  receive: string;
}) {
  return (
    <div className='grid gap-2 rounded-md bg-muted/40 p-3'>
      <h3 className='font-medium'>Quote summary</h3>
      <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
        <span className='text-muted-foreground'>You pay</span>
        <span className='text-right font-medium'>{pay}</span>
        <span className='text-muted-foreground'>Route minimum received</span>
        <span className='text-right font-medium'>{receive}</span>
        <span className='text-muted-foreground'>
          {isNativeSource ? "Maximum total required" : "Maximum native fees required"}
        </span>
        <span className='text-right font-medium'>{maximumRequirement ?? "Calculating…"}</span>
      </div>
    </div>
  );
}

export function sourceTokenCatalogMessage(isConfigured: boolean, hasError: boolean) {
  if (!isConfigured) return "Squid funding is not configured for this deployment.";
  if (hasError) return "Could not load tokens from Squid. Check the configuration or try again.";
  return "No supported tokens on this network.";
}

export function excludeDestinationUsdfc<T extends { token: string }>(tokens: readonly T[], sourceChainId: number) {
  return sourceChainId === mainnet.id
    ? tokens.filter((token) => token.token.toLowerCase() !== mainnet.contracts.usdfc.address.toLowerCase())
    : [...tokens];
}

export function SquidQuoteReview({
  acquisitionState,
  destinationAmount,
  onAcquired,
  onAcquisitionStateChange,
  onBlocked,
  onNetworkSwitchingChange,
}: SquidQuoteReviewProps) {
  // The flow is deliberately split into read-only route review and wallet execution.
  // Any execution that may have broadcast remains blocked until it is recovered or explicitly cleared.
  const { address, chainId } = useAccount();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [showAllSourceTokensFor, setShowAllSourceTokensFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const [debouncedDestinationAmount] = useDebounce(destinationAmount, QUOTE_DEBOUNCE_MS);
  const sourceChain = Number(sourceChainId);
  const sourceTokenScope = `${address ?? ""}:${sourceChain}`;
  const showAllSourceTokens = showAllSourceTokensFor === sourceTokenScope;
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
  const {
    data: sourceTokenBalances,
    isError: isTokenBalanceError,
    isFetching: isLoadingTokenBalances,
    refetch: refetchTokenBalances,
  } = useQuery({
    enabled: !!address && !!sourcePublicClient && selectableTokens.length > 0,
    queryFn: () => {
      if (!address || !sourcePublicClient) throw new Error("Source network client is unavailable");
      return readSourceTokenBalances(sourcePublicClient, address, selectableTokens);
    },
    queryKey: sourceTokenBalancesQueryKey(
      address ?? "0x0000000000000000000000000000000000000000",
      sourceChain,
      selectableTokens,
    ),
  });
  const hasUnknownTokenBalances = sourceTokenBalances
    ? hasUnknownSourceTokenBalances(selectableTokens, sourceTokenBalances)
    : false;
  const canFilterWalletTokens = !!sourceTokenBalances && !hasUnknownTokenBalances && !isTokenBalanceError;
  const visibleTokens = visibleSourceTokens(
    selectableTokens,
    isTokenBalanceError ? undefined : sourceTokenBalances,
    showAllSourceTokens,
    sourceTokenAddress,
  );
  const sourceTokenOptions: readonly SearchableOption[] = visibleTokens.map((token) => ({
    aliases: [token.symbol, token.token],
    label: `${token.symbol} (${formatAddress(token.token)})`,
    value: token.token,
  }));
  const source = selectableTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const inventoriedSourceBalance = source ? sourceTokenBalance(sourceTokenBalances, source.token) : undefined;
  const hasInventoriedSourceBalance = typeof inventoriedSourceBalance === "bigint";
  const isBusy = acquisitionState !== "idle";
  const isNativeSource = source?.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const isQuoteDebouncing = destinationAmount !== debouncedDestinationAmount;
  const readSelectedBalance = () => {
    if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
    return readSourceTokenBalance(sourcePublicClient, address, source);
  };
  const {
    data: separatelyLoadedSourceBalance,
    isError: isSeparateSourceBalanceError,
    isFetching: isLoadingSeparateSourceBalance,
    refetch: refetchSourceBalance,
  } = useQuery({
    enabled: !!address && !!source && !!sourcePublicClient && !hasInventoriedSourceBalance,
    queryFn: readSelectedBalance,
    queryKey: ["squid", "source-balance", sourceChain, sourceTokenAddress, address],
  });
  const sourceBalance = hasInventoriedSourceBalance ? inventoriedSourceBalance : separatelyLoadedSourceBalance;
  const isSourceBalanceError = !hasInventoriedSourceBalance && isSeparateSourceBalanceError;
  const isLoadingSourceBalance = !hasInventoriedSourceBalance && isLoadingSeparateSourceBalance;
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
      sourceChain,
      sourceTokenAddress,
      sourceAmount?.toString() ?? "",
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });
  const plan = isQuoteDebouncing ? undefined : quotedPlan;
  const quote = plan?.quotes[0];
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
  const availableNetworkGasMaximum = networkGas.maximum !== null && networkGas.maximum > 0n ? networkGas.maximum : null;
  const maximumNetworkFeeLabel =
    sourceChainMeta && availableNetworkGasMaximum !== null
      ? formatNativeFee(availableNetworkGasMaximum, sourceChainMeta.nativeCurrency)
      : null;
  const requiredNativeBalance =
    plan && availableNetworkGasMaximum !== null ? getRequiredNativeBalance(plan, availableNetworkGasMaximum) : 0n;
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

  const refetchSelectedBalance = async () => {
    if (!source) return { data: undefined, isError: true };
    try {
      return { data: await readSelectedBalance(), isError: false };
    } catch {
      return { data: undefined, isError: true };
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
    const latestBalanceResult = await refetchSelectedBalance();
    if (latestBalanceResult.isError || latestBalanceResult.data === undefined) {
      return setError("Could not refresh your source-token balance. Try again before confirming.");
    }
    if (quote.sourceAmount > latestBalanceResult.data) {
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
          execute: ({ onSwapAttempt, onSwapBroadcast }) =>
            executeSquidTopUp({
              destinationClient: destinationClient as unknown as SquidPublicClient,
              integratorId,
              maxNativeFee: reviewedNetworkGasMaximum,
              maxTotalNativeRouteFee: bridgeNativeFees.maximum,
              onSwapAttempt,
              onSwapBroadcast,
              plan,
              sourcePublicClient: publicClient as unknown as SquidPublicClient,
              sourceWalletClient: sourceWalletClient as SquidWalletClient,
            }),
          minimumDestinationAmount: quote.requirement.amount,
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
        onBlocked(outcome.acquisition);
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
        <Select
          disabled={isBusy}
          onValueChange={(value) => {
            setError(null);
            setSwitchError(null);
            if (value !== sourceChainId) {
              setSourceChainId(value);
              setSourceTokenAddress("");
              setShowAllSourceTokensFor(null);
            }
          }}
          value={sourceChainId || undefined}
        >
          <SelectTrigger
            aria-describedby={sourceChain === chainId ? "squid-source-network-status" : undefined}
            className='w-full'
            id='squid-source-network'
          >
            <SelectValue placeholder='Select a network' />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_CHAIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='grid gap-1'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor='squid-source-token'>Source token</Label>
          {canFilterWalletTokens && (
            <Button
              disabled={isBusy}
              onClick={() => setShowAllSourceTokensFor(showAllSourceTokens ? null : sourceTokenScope)}
              size='compact'
              type='button'
              variant='tertiary'
            >
              {showAllSourceTokens ? "Show wallet tokens" : "Show all tokens"}
            </Button>
          )}
        </div>
        <SearchableSelect
          aria-describedby={source && !isSourceBalanceError ? "squid-source-token-balance" : undefined}
          disabled={isBusy || quotesUnavailable || sourceChainId === "" || isLoadingTokens || tokenLoadFailed}
          id='squid-source-token'
          invalidMessage='Choose a source token from the suggestions.'
          key={sourceChainId}
          onValueChange={(value) => {
            setError(null);
            setSourceTokenAddress(value);
          }}
          options={sourceTokenOptions}
          placeholder={isLoadingTokens ? "Loading tokens…" : "Search tokens"}
          value={sourceTokenAddress}
        />
        {address && selectableTokens.length > 0 && isLoadingTokenBalances && !sourceTokenBalances && (
          <p aria-live='polite' className='text-xs text-muted-foreground' role='status'>
            Checking this wallet for supported token balances. All tokens remain searchable while this loads.
          </p>
        )}
        {canFilterWalletTokens && !showAllSourceTokens && visibleTokens.length === 0 && (
          <p className='text-xs text-muted-foreground'>
            No supported tokens with a balance. Show all tokens to browse.
          </p>
        )}
        {(isTokenBalanceError || hasUnknownTokenBalances) && (
          <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground' role='status'>
            <span>Some wallet balances could not be checked. The complete token catalog is shown.</span>
            <Button
              disabled={isLoadingTokenBalances}
              onClick={() => void refetchTokenBalances()}
              size='compact'
              type='button'
              variant='tertiary'
            >
              {isLoadingTokenBalances ? "Retrying…" : "Retry balances"}
            </Button>
          </div>
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

      {quote && (
        <div className='grid gap-2 border-t pt-3'>
          <SquidQuoteSummary
            isNativeSource={isNativeSource === true}
            maximumRequirement={
              networkGas.maximum === 0n
                ? "Unavailable"
                : availableNetworkGasMaximum === null
                  ? null
                  : requiredNativeBalanceLabel
            }
            pay={displayAmount(quote.sourceAmount, plan.source.decimals, plan.source.symbol)}
            receive={displayAmount(quote.destinationAmount, USDFC_DECIMALS, "USDFC")}
          />
          <details className='rounded-md border p-3'>
            <summary className='cursor-pointer font-medium'>View fee and route details</summary>
            <div className='mt-3 grid gap-3 text-sm'>
              {bridgeFeeLabel && maximumBridgeFeeLabel && (
                <div>
                  <h4 className='mb-1 font-medium'>Bridge fee</h4>
                  <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                    <span className='text-muted-foreground'>Estimated</span>
                    <span className='text-right'>{bridgeFeeLabel}</span>
                    <span className='text-muted-foreground'>Maximum</span>
                    <span className='text-right'>{maximumBridgeFeeLabel}</span>
                  </div>
                </div>
              )}
              {estimatedNetworkFeeLabel && maximumNetworkFeeLabel && networkGas.transactionCount !== null && (
                <div>
                  <h4 className='mb-1 font-medium'>Source-network gas</h4>
                  <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                    <span className='text-muted-foreground'>Estimated</span>
                    <span className='text-right'>{estimatedNetworkFeeLabel}</span>
                    <span className='text-muted-foreground'>Maximum</span>
                    <span className='text-right'>{maximumNetworkFeeLabel}</span>
                    <span className='text-muted-foreground'>Expected transactions</span>
                    <span className='text-right'>{networkGas.transactionCount}</span>
                  </div>
                </div>
              )}
              {otherSquidFeeCosts.length > 0 && (
                <div>
                  <h4 className='mb-1 font-medium'>Other Squid fees (estimated)</h4>
                  <ul className='grid gap-1'>
                    {otherSquidFeeCosts.map((cost, index) => (
                      <li className='flex justify-between gap-3' key={`${cost.name}-${cost.token.chainId}-${index}`}>
                        <span className='text-muted-foreground'>{cost.name}</span>
                        <span>{displayAmount(cost.amount, cost.token.decimals, cost.token.symbol)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {otherNetworkGasCosts.length > 0 && (
                <div>
                  <h4 className='mb-1 font-medium'>Other network gas (estimated)</h4>
                  <ul className='grid gap-1'>
                    {otherNetworkGasCosts.map((cost, index) => (
                      <li className='flex justify-between gap-3' key={`${cost.name}-${cost.token.chainId}-${index}`}>
                        <span className='text-muted-foreground'>{cost.name}</span>
                        <span>{displayAmount(cost.amount, cost.token.decimals, cost.token.symbol)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                <span className='text-muted-foreground'>Required amount</span>
                <span className='text-right'>{displayAmount(quote.requirement.amount, USDFC_DECIMALS, "USDFC")}</span>
                <span className='text-muted-foreground'>Slippage</span>
                <span className='text-right'>1%</span>
              </div>
              {maximumBridgeFeeLabel && maximumNetworkFeeLabel && (
                <p className='text-xs text-muted-foreground'>
                  The route is refreshed before signing. Execution stops if its cumulative bridge fee exceeds the
                  reviewed bridge maximum or if cumulative prepared source-network gas exceeds the separate gas maximum.
                </p>
              )}
              <p className='text-xs text-muted-foreground'>
                Route: {quote.actions.map((action) => action.description ?? action.type).join(" → ")}
              </p>
            </div>
          </details>

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
                Acquiring USDFC…
              </span>
            ) : (
              "Acquire USDFC"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
