"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import {
  fetchSourceTokens,
  NATIVE_TOKEN_ADDRESS,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";
import { formatUsdfcAmount, USDFC_DECIMALS } from "../data/funding-runway";
import {
  beginSquidAcquisition,
  clearSquidAcquisition,
  markSquidAcquired,
  markSquidBroadcast,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { executeSquidTopUp, isUserRejectedRequest } from "../data/squid-execution";
import { planSquidTopUp } from "../data/squid-quote";

const QUOTE_DEBOUNCE_MS = 500;

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
  destinationAmount: bigint | null;
  onAcquired: (acquisition: SquidAcquisition) => void;
  onAcquisitionStateChange: (state: "acquired" | "blocked" | "idle" | "processing") => void;
  onBlocked: (acquisition: SquidAcquisition) => void;
};

function displayAmount(amount: bigint, decimals: number, symbol: string) {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "expired";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function sourceTokenCatalogMessage(isConfigured: boolean, hasError: boolean) {
  if (!isConfigured) return "Squid funding is not configured for this deployment.";
  if (hasError) return "Could not load tokens from Squid. Check the configuration or try again.";
  return "No supported tokens on this network.";
}

export function sourceSpendCap(sourceBalance: bigint, maximumNativeFee: bigint, isNativeSource: boolean) {
  if (!isNativeSource) return sourceBalance;
  return maximumNativeFee < sourceBalance ? sourceBalance - maximumNativeFee : 0n;
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
  destinationAmount,
  onAcquired,
  onAcquisitionStateChange,
  onBlocked,
}: SquidQuoteReviewProps) {
  // The flow is deliberately split into read-only route review and wallet execution.
  // Any execution that may have broadcast remains blocked until it is recovered or explicitly cleared.
  const { address, chainId } = useAccount();
  const { constants } = useSynapse();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [sourceChainQuery, setSourceChainQuery] = useState("");
  const [sourceChainQueryTouched, setSourceChainQueryTouched] = useState(false);
  const [sourceTokenQuery, setSourceTokenQuery] = useState("");
  const [sourceTokenQueryTouched, setSourceTokenQueryTouched] = useState(false);
  const [maximumNativeFee, setMaximumNativeFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const sourceChainListId = useId();
  const sourceTokenListId = useId();
  const latestAddress = useRef(address);
  latestAddress.current = address;
  const [debouncedDestinationAmount] = useDebounce(destinationAmount, QUOTE_DEBOUNCE_MS);
  const [debouncedMaximumNativeFee] = useDebounce(maximumNativeFee, QUOTE_DEBOUNCE_MS);
  const isQuoteDebouncing =
    destinationAmount !== debouncedDestinationAmount || maximumNativeFee !== debouncedMaximumNativeFee;
  const sourceChain = Number(sourceChainId);
  const sourcePublicClient = usePublicClient({ chainId: sourceChain || undefined });
  const { data: sourceWalletClient } = useWalletClient({ chainId: sourceChain || undefined });
  const destinationClient = usePublicClient({ chainId: 314 });
  const integratorId =
    process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() || "filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862";
  const quotesUnavailable = integratorId === "";
  const sourceChainMeta = SQUID_SOURCE_CHAINS.find((chain) => chain.id === sourceChain);
  const nativeSymbol = sourceChainMeta?.nativeCurrency?.symbol ?? "the native token";
  const {
    data: tokens = [],
    error: tokenLoadError,
    isError: isTokenLoadError,
    isFetching: isLoadingTokens,
    refetch: refetchTokens,
  } = useQuery({
    enabled: !quotesUnavailable && SQUID_SOURCE_CHAINS.some((chain) => chain.id === sourceChain),
    queryFn: () => fetchSourceTokens(sourceChain, { integratorId }),
    queryKey: ["squid", "source-tokens", sourceChain],
    retry: false,
    staleTime: 60_000,
  });
  const tokenLoadFailed = isTokenLoadError && tokens.length === 0;
  const sourceTokenOptions: readonly SearchableOption[] = tokens.map((token) => ({
    aliases: [token.symbol, token.token],
    label: `${token.symbol} (${formatAddress(token.token)})`,
    value: token.token,
  }));
  const sourceChainQueryInvalid = sourceChainQueryTouched && sourceChainQuery.trim() !== "" && sourceChainId === "";
  const sourceTokenQueryInvalid =
    sourceTokenQueryTouched && sourceTokenQuery.trim() !== "" && sourceTokenAddress === "";
  const source = tokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const isBusy = acquisitionState !== "idle";
  const isNativeSource = source?.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  let maxNativeFee: bigint | null = null;
  try {
    const parsed = parseUnits(debouncedMaximumNativeFee, sourceChainMeta?.nativeCurrency.decimals ?? 18);
    if (parsed > 0n) maxNativeFee = parsed;
  } catch {
    // The fee field reports its own validation error when the user requests a quote.
  }
  const { data: sourceBalance, refetch: refetchSourceBalance } = useQuery({
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
  const sourceAmount =
    sourceBalance !== undefined && maxNativeFee !== null
      ? sourceSpendCap(sourceBalance, maxNativeFee, isNativeSource)
      : null;
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
        destinationToken: constants.contracts.usdfc,
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
      chainId,
      constants.contracts.usdfc,
      debouncedDestinationAmount?.toString() ?? "",
      sourceChain,
      sourceTokenAddress,
      debouncedMaximumNativeFee,
      sourceBalance?.toString() ?? "",
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });
  const plan = isQuoteDebouncing ? undefined : quotedPlan;
  const quote = plan?.quotes[0];
  const secondsLeft = quote ? quote.expiresAt - nowSeconds : 0;
  const isExpired = quote ? secondsLeft <= 0 : false;
  const quoteErrorMessage =
    !isQuoteDebouncing && quoteError
      ? quoteError instanceof Error && quoteError.message.includes("exceed the source-token cap")
        ? insufficientBalance
        : quoteError instanceof Error
          ? quoteError.message
          : "Squid could not provide a route."
      : null;

  useEffect(() => {
    if (!quote) return;
    setNowSeconds(Math.floor(Date.now() / 1_000));
    const interval = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(interval);
  }, [quote]);

  useEffect(() => {
    if (tokenLoadError) console.error("Failed to load Squid token catalog:", tokenLoadError);
  }, [tokenLoadError]);

  const review = () => {
    setError(null);
    if (quotesUnavailable) return setError("Squid quotes are not configured for this deployment.");
    if (!address || !source || destinationAmount === null)
      return setError("Select a source token and enter the USDFC amount.");
    if (sourceBalance === undefined) return setError("Your source-token balance is still loading. Try again shortly.");
    if (maxNativeFee === null) return setError("Enter a positive network-fee limit.");
    if (sourceAmount === null || sourceAmount <= 0n) return setError(insufficientBalance);
    void refetchQuote();
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
    const executionMaxNativeFee = maxNativeFee;
    if (executionMaxNativeFee === null) return setError("Enter a positive network-fee limit.");
    if (plan.quotes.some((planQuote) => planQuote.expiresAt <= Math.floor(Date.now() / 1_000)))
      return setError("This route expired. Review it again before acquiring USDFC.");

    const latestBalanceResult = await refetchSourceBalance();
    if (latestBalanceResult.isError || latestBalanceResult.data === undefined) {
      return setError("Could not refresh your source-token balance. Try again before confirming.");
    }
    const requiredSourceBalance = quote.sourceAmount + (isNativeSource ? executionMaxNativeFee : 0n);
    if (requiredSourceBalance > latestBalanceResult.data) {
      return setError(
        `Your ${source.symbol} balance no longer covers the quote and network-fee limit. Refresh the quote.`,
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
    let acquisition: ReturnType<typeof beginSquidAcquisition>;
    try {
      acquisition = beginSquidAcquisition(window.localStorage, address, destinationAmount, source.chainId);
    } catch {
      return setError("Browser storage is unavailable. Squid funding cannot start safely without recovery state.");
    }

    const isCurrentExecutionOwner = () => latestAddress.current?.toLowerCase() === address.toLowerCase();
    let didAttemptTransaction = false;
    let didBroadcast = false;
    onAcquisitionStateChange("processing");
    try {
      await executeSquidTopUp({
        destinationClient: destinationClient as unknown as SquidPublicClient,
        integratorId,
        maxNativeFee: executionMaxNativeFee,
        onBroadcast: (hash) => {
          didBroadcast = true;
          acquisition = markSquidBroadcast(window.localStorage, acquisition, hash);
        },
        onTransactionAttempt: () => {
          didAttemptTransaction = true;
        },
        plan,
        sourcePublicClient: publicClient as unknown as SquidPublicClient,
        sourceWalletClient: sourceWalletClient as SquidWalletClient,
      });
      const acquired = markSquidAcquired(window.localStorage, acquisition);
      if (isCurrentExecutionOwner()) {
        onAcquisitionStateChange("acquired");
        onAcquired(acquired);
      }
    } catch (executionError) {
      if (!didAttemptTransaction || (!didBroadcast && isUserRejectedRequest(executionError))) {
        try {
          clearSquidAcquisition(window.localStorage, address);
          if (isCurrentExecutionOwner()) onAcquisitionStateChange("idle");
        } catch {
          if (isCurrentExecutionOwner()) {
            onBlocked(acquisition);
            onAcquisitionStateChange("blocked");
          }
        }
      } else if (isCurrentExecutionOwner()) {
        onBlocked(acquisition);
        onAcquisitionStateChange("blocked");
      }
      if (isCurrentExecutionOwner()) {
        setError(
          executionError instanceof Error ? executionError.message : "Squid could not complete the acquisition.",
        );
      }
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
        <Label htmlFor='squid-source-network'>Source network</Label>
        <Input
          aria-describedby={sourceChainQueryInvalid ? "squid-source-network-error" : undefined}
          aria-invalid={sourceChainQueryInvalid}
          autoComplete='off'
          disabled={isBusy}
          id='squid-source-network'
          list={sourceChainListId}
          onBlur={() => setSourceChainQueryTouched(true)}
          onChange={(value) => {
            setError(null);
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
          aria-describedby={sourceTokenQueryInvalid ? "squid-source-token-error" : undefined}
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
      </div>

      <div className='grid gap-1 rounded-md border p-2 text-xs'>
        <Label htmlFor='squid-max-native-fee'>Maximum network fee ({nativeSymbol})</Label>
        <Input
          disabled={isBusy}
          id='squid-max-native-fee'
          min='0'
          onChange={(value) => {
            setError(null);
            setMaximumNativeFee(value);
          }}
          step='any'
          type='number'
          value={maximumNativeFee}
        />
        <p className='text-muted-foreground'>
          Enter a total source-chain fee cap. For native-token routes, this amount is kept out of the swap estimate.
        </p>
      </div>

      <Button
        disabled={
          !source ||
          destinationAmount === null ||
          isBusy ||
          isReviewing ||
          isQuoteDebouncing ||
          sourceBalance === undefined
        }
        onClick={review}
        size='compact'
        type='button'
        variant='tertiary'
      >
        {isReviewing ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            Fetching quote…
          </>
        ) : plan ? (
          "Refresh quote"
        ) : (
          "Get estimate"
        )}
      </Button>

      {(error || quoteErrorMessage) && (
        <div className='flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-destructive' role='alert'>
          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
          <span>{error || quoteErrorMessage}</span>
        </div>
      )}

      {quote && (
        <div className='grid gap-2 border-t pt-3'>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
            <span className='text-muted-foreground'>Spend (estimated)</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.sourceAmount, plan.source.decimals, plan.source.symbol)}
            </span>
            <span className='text-muted-foreground'>Your balance</span>
            <span className='text-right font-medium'>
              {sourceBalance !== undefined && source
                ? displayAmount(sourceBalance, source.decimals, source.symbol)
                : "—"}
            </span>
            <span className='text-muted-foreground'>Receive at least</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.destinationAmount, USDFC_DECIMALS, "USDFC")}
            </span>
            <span className='text-muted-foreground'>Slippage</span>
            <span className='text-right font-medium'>1%</span>
            {quote.costs.length > 0 && (
              <>
                <span className='text-muted-foreground'>Fees</span>
                <span className='text-right font-medium'>
                  {quote.costs
                    .map((cost) => displayAmount(cost.amount, cost.token.decimals, cost.token.symbol))
                    .join(", ")}
                </span>
              </>
            )}
            <span className='text-muted-foreground'>Quote expires</span>
            <span className={`text-right font-medium ${isExpired ? "text-destructive" : ""}`}>
              in {formatCountdown(secondsLeft)}
            </span>
          </div>
          <p className='text-xs text-muted-foreground'>
            Route: {quote.actions.map((action) => action.description ?? action.type).join(" → ")}
          </p>

          {isExpired ? (
            <Button
              disabled={isBusy || isReviewing || isQuoteDebouncing}
              onClick={review}
              size='compact'
              type='button'
              variant='primary'
            >
              Quote expired — refresh
            </Button>
          ) : (
            <Button disabled={isBusy} onClick={acquire} size='compact' type='button' variant='primary'>
              {acquisitionState === "processing" ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Acquiring USDFC…
                </>
              ) : (
                "Acquire USDFC"
              )}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
