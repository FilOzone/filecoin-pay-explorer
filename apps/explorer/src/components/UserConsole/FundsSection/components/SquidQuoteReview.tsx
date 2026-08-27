"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
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
import { sourceTokenBalance } from "../data/source-token-balances";
import type { SquidAcquisition } from "../data/squid-acquisition";
import { useSquidExecution } from "../hooks/useSquidExecution";
import { useSquidQuotePlan } from "../hooks/useSquidQuotePlan";
import { useSquidSourceData } from "../hooks/useSquidSourceData";
import { type SearchableOption, SearchableSelect } from "./SearchableSelect";

export { excludeDestinationUsdfc } from "../hooks/useSquidSourceData";

// Squid 429s recover slowly, so the quote fails fast with copy telling the
// user when to refresh; only the token catalog retries a burst.
const isRateLimited = (error: unknown) => error instanceof Error && error.message.includes("(429)");

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
  onNetworkSwitchingChange,
}: SquidQuoteReviewProps) {
  // The flow is deliberately split into read-only route review and wallet execution.
  // Any execution that may have broadcast remains blocked until it is recovered or explicitly cleared.
  const { address, chainId } = useAccount();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [showAllSourceTokensFor, setShowAllSourceTokensFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceChain = Number(sourceChainId);
  const sourceTokenScope = `${address ?? ""}:${sourceChain}`;
  const showAllSourceTokens = showAllSourceTokensFor === sourceTokenScope;
  const integratorId =
    process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() || "filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862";
  const quotesUnavailable = integratorId === "";
  const sourceChainMeta = SQUID_SOURCE_CHAINS.find((chain) => chain.id === sourceChain);
  const sourceData = useSquidSourceData({
    address,
    integratorId,
    showAllTokens: showAllSourceTokens,
    sourceChain,
    sourceTokenAddress,
  });
  const { allowanceQuery, inventoryQuery, nativeBalanceQuery, sourceBalanceQuery, tokenQuery } = sourceData;
  const {
    data: sourceAllowance,
    isError: isSourceAllowanceError,
    isFetching: isLoadingSourceAllowance,
  } = allowanceQuery;
  const {
    data: sourceTokenBalances,
    isError: isTokenBalanceError,
    isFetching: isLoadingTokenBalances,
  } = inventoryQuery;
  const { isError: isNativeBalanceError, isFetching: isLoadingNativeBalance } = nativeBalanceQuery;
  const { isError: isSeparateSourceBalanceError, isFetching: isLoadingSeparateSourceBalance } = sourceBalanceQuery;
  const {
    error: tokenLoadError,
    isError: isTokenLoadError,
    isFetching: isLoadingTokens,
    refetch: refetchTokens,
  } = tokenQuery;
  const {
    canFilterWalletTokens,
    hasInventoriedSourceBalance,
    hasUnknownTokenBalances,
    isNativeSource,
    nativeBalance,
    selectableTokens,
    source,
    sourceBalance,
    tokens,
    visibleTokens,
  } = sourceData;
  const tokenLoadFailed = isTokenLoadError && tokens.length === 0;
  const sourceTokenOptions: readonly SearchableOption[] = visibleTokens.map((token) => {
    const balance = sourceTokenBalance(sourceTokenBalances, token.token);
    return {
      aliases: [token.symbol, token.token],
      detail: address
        ? typeof balance === "bigint"
          ? displayAmount(balance, token.decimals, token.symbol)
          : "Unavailable"
        : undefined,
      label: `${token.symbol} (${formatAddress(token.token)})`,
      value: token.token,
    };
  });
  const isLoadingWalletTokenInventory =
    !!address && selectableTokens.length > 0 && isLoadingTokenBalances && !sourceTokenBalances;
  const isBusy = acquisitionState !== "idle";
  const isSourceBalanceError = !hasInventoriedSourceBalance && isSeparateSourceBalanceError;
  const isLoadingSourceBalance = !hasInventoriedSourceBalance && isLoadingSeparateSourceBalance;
  const sourceAmount = sourceBalance ?? null;
  const quotePlan = useSquidQuotePlan({
    acquisitionState,
    address,
    destinationAmount,
    integratorId,
    source,
    sourceAmount,
  });
  const { debouncedDestinationAmount, isQuoteDebouncing, isReviewing, plan, quoteError, refetchQuote } = quotePlan;
  const insufficientBalance =
    source && debouncedDestinationAmount !== null
      ? `You don't have enough ${source.symbol} to receive ${formatUsdfcAmount(debouncedDestinationAmount)} USDFC.`
      : null;
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
  const maximumNetworkFeeLabel =
    sourceChainMeta && networkGas.maximum !== null
      ? formatNativeFee(networkGas.maximum, sourceChainMeta.nativeCurrency)
      : null;
  const requiredNativeBalance =
    plan && networkGas.maximum !== null ? getRequiredNativeBalance(plan, networkGas.maximum) : 0n;
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

  const execution = useSquidExecution({
    acquisitionState,
    bridgeFeeMaximum: bridgeNativeFees.maximum,
    integratorId,
    isNativeSource: isNativeSource === true,
    networkGasMaximum: networkGas.maximum,
    onAcquired,
    onAcquisitionStateChange,
    onBlocked,
    onNetworkSwitchingChange,
    plan,
    refetchNativeBalance: async () => {
      const result = await nativeBalanceQuery.refetch();
      return { data: result.data, isError: result.isError };
    },
    refetchSourceAllowance: async () => {
      const result = await allowanceQuery.refetch();
      return { data: result.data, isError: result.isError };
    },
    refetchSourceBalance: sourceData.refetchSelectedBalance,
    requiredNativeBalance,
    source,
    sourceChainName: sourceChainMeta?.name,
    sourceNativeCurrencySymbol: sourceChainMeta?.nativeCurrency.symbol,
  });
  const clearErrors = () => {
    setError(null);
    execution.clearError();
  };

  useEffect(() => {
    if (tokenLoadError) console.error("Failed to load Squid token catalog:", tokenLoadError);
  }, [tokenLoadError]);

  const review = () => {
    clearErrors();
    if (quotesUnavailable) return setError("Squid quotes are not configured for this deployment.");
    if (!address || !source || destinationAmount === null)
      return setError("Select a source token and enter the USDFC amount.");
    if (isSourceBalanceError) return setError("Could not load your source-token balance. Retry the balance read.");
    if (sourceBalance === undefined) return setError("Your source-token balance is still loading. Try again shortly.");
    if (sourceAmount === null || sourceAmount <= 0n) return setError(insufficientBalance);
    void refetchQuote();
  };
  const execute = () => {
    setError(null);
    void (chainId === sourceChain ? execution.acquire() : execution.switchToSourceNetwork());
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
            clearErrors();
            if (value !== sourceChainId) {
              setSourceChainId(value);
              setSourceTokenAddress("");
              setShowAllSourceTokensFor(null);
            }
          }}
          value={sourceChainId}
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
        {isLoadingWalletTokenInventory ? (
          <div
            aria-live='polite'
            className='flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground'
            role='status'
          >
            <Loader2 aria-hidden='true' className='size-4 animate-spin' />
            Checking wallet balances…
          </div>
        ) : (
          <SearchableSelect
            aria-describedby={source && !isSourceBalanceError ? "squid-source-token-balance" : undefined}
            disabled={isBusy || quotesUnavailable || sourceChainId === "" || isLoadingTokens || tokenLoadFailed}
            id='squid-source-token'
            invalidMessage='Choose a source token from the suggestions.'
            key={sourceChainId}
            onValueChange={(value) => {
              clearErrors();
              setSourceTokenAddress(value);
            }}
            options={sourceTokenOptions}
            placeholder={isLoadingTokens ? "Loading tokens…" : "Search tokens"}
            value={sourceTokenAddress}
          />
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
              onClick={() => void inventoryQuery.refetch()}
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
                clearErrors();
                void sourceBalanceQuery.refetch();
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
                clearErrors();
                void nativeBalanceQuery.refetch();
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
                clearErrors();
                void allowanceQuery.refetch();
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

      {(error ||
        execution.error ||
        execution.switchError ||
        quoteErrorMessage ||
        capBlockedMessage ||
        nativeBalanceBlockedMessage) && (
        <div className='flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-destructive' role='alert'>
          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
          <span>
            {error ||
              execution.error ||
              execution.switchError ||
              quoteErrorMessage ||
              capBlockedMessage ||
              nativeBalanceBlockedMessage}
          </span>
        </div>
      )}

      {quote && (
        <div className='grid gap-2 border-t pt-3'>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
            <span className='text-muted-foreground'>Spend (estimated)</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.sourceAmount, plan.source.decimals, plan.source.symbol)}
            </span>
            <span className='text-muted-foreground'>Estimated received</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.destinationAmount, USDFC_DECIMALS, "USDFC")}
            </span>
            <span className='text-muted-foreground'>Execution minimum</span>
            <span className='text-right font-medium'>
              {displayAmount(quote.requirement.amount, USDFC_DECIMALS, "USDFC")}
            </span>
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
              execution.isSwitchingChain ||
              isSourceAllowanceBlocked ||
              isSeparateNativeBalanceBlocked ||
              nativeBalance === undefined ||
              networkGas.maximum === null ||
              networkGas.maximum === 0n ||
              nativeBalance < requiredNativeBalance ||
              (chainId === sourceChain && execution.isPreparingWallet)
            }
            onClick={execute}
            size='compact'
            type='button'
            variant='primary'
          >
            {execution.isSwitchingChain ? (
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Switching network…
              </span>
            ) : chainId !== sourceChain ? (
              `Switch wallet to ${sourceChainMeta?.name ?? "source network"}`
            ) : execution.isPreparingWallet ? (
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
