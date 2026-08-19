"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import {
  fetchSourceTokens,
  type SquidFundingPlan,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import { USDFC_DECIMALS } from "../data/funding-runway";
import {
  beginSquidAcquisition,
  clearSquidAcquisition,
  markSquidAcquired,
  markSquidBroadcast,
  type SquidAcquisition,
} from "../data/squid-acquisition";
import { executeSquidTopUp, isUserRejectedRequest } from "../data/squid-execution";
import { planSquidTopUp } from "../data/squid-quote";

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
  const [sourceAmount, setSourceAmount] = useState("");
  const [plan, setPlan] = useState<SquidFundingPlan | null>(null);
  const [planQuoteKey, setPlanQuoteKey] = useState("");
  const [maximumNativeFee, setMaximumNativeFee] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const quoteKey = `${address}:${chainId}:${destinationAmount}:${sourceAmount}:${sourceChainId}:${sourceTokenAddress}`;
  const latestQuoteKey = useRef(quoteKey);
  const latestAddress = useRef(address);
  latestQuoteKey.current = quoteKey;
  latestAddress.current = address;
  const sourceChain = Number(sourceChainId);
  const sourcePublicClient = usePublicClient({ chainId: sourceChain || undefined });
  const { data: sourceWalletClient } = useWalletClient({ chainId: sourceChain || undefined });
  const destinationClient = usePublicClient({ chainId: 314 });
  const integratorId = process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() ?? "";
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
  });
  const tokenLoadFailed = isTokenLoadError && tokens.length === 0;
  const source = tokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const quote = plan?.quotes[0];
  const secondsLeft = quote ? quote.expiresAt - nowSeconds : 0;
  const isExpired = quote ? secondsLeft <= 0 : false;
  const isBusy = acquisitionState !== "idle";

  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies intentionally invalidate the displayed quote.
  useEffect(() => {
    setPlan(null);
    setPlanQuoteKey("");
  }, [quoteKey]);

  useEffect(() => {
    if (!quote) return;
    const interval = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(interval);
  }, [quote]);

  useEffect(() => {
    if (tokenLoadError) console.error("Failed to load Squid token catalog:", tokenLoadError);
  }, [tokenLoadError]);

  const review = async () => {
    setError(null);
    if (quotesUnavailable) return setError("Squid quotes are not configured for this deployment.");
    if (!address || !source || destinationAmount === null)
      return setError("Select a source token and enter both amounts.");
    let parsedSourceAmount: bigint;
    try {
      parsedSourceAmount = parseUnits(sourceAmount, source.decimals);
    } catch {
      return setError("Enter a valid source amount.");
    }
    if (parsedSourceAmount <= 0n) return setError("Enter a source amount greater than zero.");
    const reviewedQuoteKey = quoteKey;
    setIsReviewing(true);
    try {
      const result = await planSquidTopUp({
        destinationAmount,
        destinationToken: constants.contracts.usdfc,
        integratorId,
        owner: address,
        source,
        sourceAmount: parsedSourceAmount,
      });
      if (latestQuoteKey.current !== reviewedQuoteKey) {
        throw new Error("Funding details or wallet changed while requesting the quote.");
      }
      setPlan(result);
      setPlanQuoteKey(reviewedQuoteKey);
      setMaximumNativeFee("");
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : "Squid could not provide a route.");
    } finally {
      setIsReviewing(false);
    }
  };

  const acquire = async () => {
    setError(null);
    if (acquisitionState === "blocked")
      return setError("Check your source wallet activity before starting another acquisition.");
    if (acquisitionState !== "idle") return setError("This acquisition is already complete or in progress.");
    if (!address || !source || !plan || planQuoteKey !== quoteKey || destinationAmount === null)
      return setError("Review a route before acquiring USDFC.");
    if (chainId !== source.chainId)
      return setError("Switch your wallet to the selected source network before confirming.");
    if (!sourcePublicClient || !sourceWalletClient || !destinationClient)
      return setError("Wallet or network client is unavailable.");
    if (!sourceWalletClient.account || sourceWalletClient.account.address.toLowerCase() !== address.toLowerCase())
      return setError("Wallet account changed before confirming.");
    let maxNativeFee: bigint;
    try {
      maxNativeFee = parseUnits(maximumNativeFee, sourceChainMeta?.nativeCurrency.decimals ?? 18);
    } catch {
      return setError("Enter a valid maximum network fee.");
    }
    if (maxNativeFee <= 0n) return setError("Enter a positive network-fee limit.");
    if (plan.quotes.some((planQuote) => planQuote.expiresAt <= Math.floor(Date.now() / 1_000)))
      return setError("This route expired. Review it again before acquiring USDFC.");

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
        maxNativeFee,
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
      <p className='font-medium'>Acquire USDFC with Squid</p>

      {quotesUnavailable && (
        <p className='rounded-md bg-muted/50 p-2 text-muted-foreground'>{sourceTokenCatalogMessage(false, false)}</p>
      )}

      <div className='grid gap-1'>
        <Label htmlFor='squid-source-network'>Source network</Label>
        <Select
          disabled={isBusy}
          onValueChange={(value) => {
            setSourceChainId(value);
            setSourceTokenAddress("");
          }}
          value={sourceChainId || undefined}
        >
          <SelectTrigger className='w-full' id='squid-source-network'>
            <SelectValue placeholder='Select a network' />
          </SelectTrigger>
          <SelectContent>
            {SQUID_SOURCE_CHAINS.map((chain) => (
              <SelectItem key={chain.id} value={String(chain.id)}>
                {chain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='grid gap-1'>
        <Label htmlFor='squid-source-token'>Source token</Label>
        <Select
          disabled={isBusy || quotesUnavailable || sourceChainId === "" || isLoadingTokens || tokenLoadFailed}
          onValueChange={setSourceTokenAddress}
          value={sourceTokenAddress || undefined}
        >
          <SelectTrigger className='w-full' id='squid-source-token'>
            <SelectValue placeholder={isLoadingTokens ? "Loading tokens…" : "Select a token"} />
          </SelectTrigger>
          <SelectContent>
            {tokens.length === 0 && !isLoadingTokens ? (
              <div className='px-2 py-1.5 text-sm text-muted-foreground'>
                {sourceTokenCatalogMessage(!quotesUnavailable, isTokenLoadError)}
              </div>
            ) : (
              tokens.map((token) => (
                <SelectItem key={token.token} value={token.token}>
                  {token.symbol}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
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
      </div>

      <div className='grid gap-1'>
        <Label htmlFor='squid-source-amount'>Maximum source amount</Label>
        <Input
          disabled={isBusy}
          id='squid-source-amount'
          min='0'
          onChange={setSourceAmount}
          placeholder='0.0'
          step='any'
          type='number'
          value={sourceAmount}
        />
      </div>

      <Button
        disabled={!source || destinationAmount === null || isBusy || isReviewing}
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
          "Review route"
        )}
      </Button>

      {error && (
        <div className='flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-destructive' role='alert'>
          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
          <span>{error}</span>
        </div>
      )}

      {quote && planQuoteKey === quoteKey && (
        <div className='grid gap-2 border-t pt-3'>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
            <span className='text-muted-foreground'>Spend</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.sourceAmount, plan.source.decimals, plan.source.symbol)}
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

          <div className='grid gap-1 rounded-md border p-2 text-xs'>
            <Label htmlFor='squid-max-native-fee'>Maximum network fee ({nativeSymbol})</Label>
            <Input
              disabled={isBusy}
              id='squid-max-native-fee'
              min='0'
              onChange={setMaximumNativeFee}
              step='any'
              type='number'
              value={maximumNativeFee}
            />
            <p className='text-muted-foreground'>
              Enter a total source-chain fee cap. Approval and route transactions all count toward it, and execution
              stops before exceeding it.
            </p>
          </div>

          {isExpired ? (
            <Button disabled={isBusy || isReviewing} onClick={review} size='compact' type='button' variant='primary'>
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
