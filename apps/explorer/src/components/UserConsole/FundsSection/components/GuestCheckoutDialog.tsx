"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Input } from "@filecoin-pay/ui/components/input";
import { Label } from "@filecoin-pay/ui/components/label";
import { getIdentityToken } from "@privy-io/react-auth";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Clock3, LoaderCircle, LockKeyhole, RotateCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { type Address, formatUnits, parseUnits } from "viem";
import type { GuestCoinbaseQuote } from "@/app/api/coinbase/quote/quote";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import { formatAddress, formatTokenTruncated } from "@/utils/formatter";
import { type GuestRouteEstimate, getGuestRouteEstimate } from "../data/guestRoute";

type GuestCheckoutProps = {
  address: Address;
  onClose: () => void;
  onOtherMethods: () => void;
};

function paymentAmount(input: string) {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(input)) return null;
  const [dollars, fraction = ""] = input.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return cents >= 500 && cents <= 5000 ? `${Number(dollars)}.${fraction.padEnd(2, "0")}` : null;
}

async function getCoinbaseQuote(address: Address, amount: string, signal: AbortSignal): Promise<GuestCoinbaseQuote> {
  const token = await getIdentityToken().catch(() => null);
  const response = await fetch("/api/coinbase/quote", {
    body: JSON.stringify({ address, paymentAmount: amount }),
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    method: "POST",
    signal,
  });
  const body = await response.json().catch(() => null);
  if (response.status === 503) {
    if (body?.code === "sandbox_unconfigured") {
      throw new Error("Live Apple Pay estimates haven’t been enabled for this preview. Choose another funding option.");
    }
    throw new Error("Apple Pay estimates are unavailable right now. Try another funding option or check again later.");
  }
  if (!response.ok || !body) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Coinbase could not provide an estimate. Try again.",
    );
  }
  return body;
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-baseline justify-between gap-3'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='shrink-0 text-right font-medium tabular-nums'>{value}</dd>
    </div>
  );
}

function QuoteNotice({ message, state }: { message: string; state: "blocked" | "error" | "expired" | "loading" }) {
  const loading = state === "loading";
  const Icon = { blocked: LockKeyhole, error: LockKeyhole, expired: Clock3, loading: LoaderCircle }[state];
  return (
    <div
      className={
        loading
          ? "flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-sm text-muted-foreground"
          : "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      }
      role={state === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden className={loading ? "size-4 shrink-0 motion-safe:animate-spin" : "mt-0.5 size-4 shrink-0"} />
      <div>
        {state === "blocked" || state === "error" ? <p className='font-semibold'>Checkout unavailable</p> : null}
        <p className='leading-5'>{message}</p>
      </div>
    </div>
  );
}

function Receipt({ quote, estimate }: { quote: GuestCoinbaseQuote; estimate?: GuestRouteEstimate }) {
  const expiresAt = estimate?.expiresAt;
  const [expired, setExpired] = useState(() => expiresAt !== undefined && Date.now() >= expiresAt);
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  const route = expired ? undefined : estimate;

  return (
    <>
      {route && (
        <div className='relative rounded-2xl bg-brand-50 px-4 py-4 text-brand-950 sm:px-5 dark:bg-brand-950/50 dark:text-brand-100'>
          <span
            aria-hidden
            className='absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white shadow-sm sm:right-5 sm:size-12'
          >
            <USDFCLogo className='size-6 sm:size-8' />
          </span>
          <dl>
            <div className='pr-10 sm:pr-14'>
              <dt className='text-sm font-medium'>Minimum Filecoin Pay deposit</dt>
              <dd className='mt-1 flex flex-wrap items-baseline gap-x-2 font-semibold tabular-nums'>
                <span className='text-4xl tracking-tight sm:text-[2.6rem]'>
                  {formatTokenTruncated(route.minimumDepositUsdfc, 18, "", 6)}
                </span>{" "}
                <span className='text-base text-brand-900 dark:text-brand-200'>USDFC</span>
              </dd>
            </div>
            <div className='mt-3 flex items-center justify-between gap-2 border-t border-brand-800/15 pt-3 text-sm dark:border-brand-200/20'>
              <dt className='flex items-center gap-2'>
                <span aria-hidden>
                  <FilecoinLogo className='size-4' />
                </span>
                FIL for wallet network fees
              </dt>
              <dd className='shrink-0 font-semibold tabular-nums'>{formatUnits(route.minimumFil, 18)} FIL</dd>
            </div>
          </dl>
        </div>
      )}
      <dl className='grid gap-1.5 text-sm'>
        <div className='flex items-baseline justify-between gap-3 font-semibold'>
          <dt>Total charge</dt>
          <dd className='text-lg tabular-nums'>${quote.paymentTotal}</dd>
        </div>
        <QuoteRow label='Coinbase fees' value={`$${quote.feeTotal}`} />
        <QuoteRow label='USDC delivered on Base' value={`${quote.purchaseAmount} USDC`} />
        {route && (
          <QuoteRow
            label='Base gas and bridge fee budget'
            value={`Up to ${formatUnits(route.networkReserveUsdc, 6)} USDC`}
          />
        )}
      </dl>
      {route && (
        <>
          <details className='group border-t pt-3 text-sm'>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden'>
              Conversion details
              <ChevronDown aria-hidden className='size-4 text-muted-foreground group-open:rotate-180' />
            </summary>
            <dl className='mt-3 grid gap-1.5'>
              <QuoteRow label='Base USDC to convert' value={`${formatUnits(route.sourceSpendUsdc, 6)} USDC`} />
              <QuoteRow
                label='Bridge fee within the budget'
                value={`Up to ${formatUnits(route.bridgeFeeUsdc, 6)} USDC`}
              />
              <QuoteRow label='USDFC budget for FIL' value={`${formatUnits(route.filSpendUsdfc, 18)} USDFC`} />
            </dl>
          </details>
          <QuoteNotice message={route.paymentBlocker} state='blocked' />
        </>
      )}
      {expired && (
        <QuoteNotice message='The Squid estimate expired. Refresh to see current proceeds.' state='expired' />
      )}
    </>
  );
}

function Estimate({
  address,
  amount,
  onOtherMethods,
}: {
  address: Address;
  amount: string | null;
  onOtherMethods: () => void;
}) {
  const coinbase = useQuery({
    queryKey: ["guest-coinbase-quote", address, amount],
    queryFn: amount ? ({ signal }) => getCoinbaseQuote(address, amount, signal) : skipToken,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const quote = !coinbase.isFetching && coinbase.isSuccess ? coinbase.data : null;
  const purchaseAmount = quote?.purchaseAmount;
  const route = useQuery({
    queryKey: ["guest-filecoin-route", address, amount, purchaseAmount, coinbase.dataUpdatedAt],
    queryFn: purchaseAmount
      ? () => getGuestRouteEstimate({ wallet: address, receivedUsdc: parseUnits(purchaseAmount, 6) })
      : skipToken,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const estimate = !route.isFetching && route.isSuccess ? route.data : undefined;

  return (
    <>
      {amount && (
        <section className='grid gap-3.5' aria-label='Top-up estimate' aria-live='polite'>
          {coinbase.isFetching && <QuoteNotice state='loading' message='Getting your Coinbase estimate…' />}
          {!coinbase.isFetching && coinbase.error && <QuoteNotice state='error' message={coinbase.error.message} />}
          {quote && (
            <>
              <Receipt key={`${estimate?.quoteId}-${estimate?.expiresAt}`} quote={quote} estimate={estimate} />
              {route.isFetching && (
                <QuoteNotice state='loading' message='Checking Filecoin proceeds and network fees…' />
              )}
              {!route.isFetching && route.error && <QuoteNotice state='error' message={route.error.message} />}
            </>
          )}
        </section>
      )}
      <DialogFooter className='flex-col gap-2 border-t pt-4 sm:items-center sm:justify-between'>
        <Button
          disabled={!amount || coinbase.isFetching || route.isFetching}
          onClick={() => void coinbase.refetch()}
          size='compact'
          type='button'
          variant='tertiary'
        >
          <span className='inline-flex items-center gap-2'>
            <RotateCw aria-hidden className='size-4' />
            Refresh estimate
          </span>
        </Button>
        <Button onClick={onOtherMethods} type='button' size='compact' variant='primary'>
          <span className='inline-flex items-center gap-2'>
            <ArrowLeft aria-hidden className='size-4' />
            Other funding options
          </span>
        </Button>
      </DialogFooter>
    </>
  );
}

export default function GuestCheckoutDialog({ address, onClose, onOtherMethods }: GuestCheckoutProps) {
  const [input, setInput] = useState("5.00");
  const amount = paymentAmount(input);
  const [debouncedAmount] = useDebounce(amount, 400);
  const requestedAmount = amount === debouncedAmount ? amount : null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className='max-h-[calc(100dvh-1.5rem)] gap-4 overflow-y-auto rounded-2xl px-5 py-5 shadow-xl sm:max-w-[540px] sm:gap-5 sm:p-7'>
        <DialogHeader className='gap-1.5 pr-6 text-left'>
          <DialogTitle className='text-2xl font-semibold tracking-tight sm:text-[1.75rem]'>
            Coinbase Apple Pay estimate
          </DialogTitle>
          <DialogDescription>
            Sandbox preview for US guests. Review your proceeds before verification.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-2'>
          <Label className='text-sm font-medium' htmlFor='guest-purchase-amount'>
            Purchase amount (USD)
          </Label>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2.5'>
            <div className='flex min-w-32 flex-1 items-center gap-1.5 rounded-lg border bg-background px-3.5 focus-within:ring-2 focus-within:ring-brand-700'>
              <span aria-hidden className='text-xl text-muted-foreground'>
                $
              </span>
              <Input
                aria-describedby='guest-purchase-range'
                aria-invalid={!amount}
                className='h-12 border-0 bg-transparent px-0 text-2xl font-semibold tabular-nums shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent'
                id='guest-purchase-amount'
                inputMode='decimal'
                maxLength={5}
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
            </div>
            <fieldset className='flex items-center gap-1.5' aria-label='Preset amounts'>
              {[5, 25, 50].map((dollars) => (
                <button
                  key={dollars}
                  aria-pressed={amount === `${dollars}.00`}
                  className='min-h-10 rounded-full border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-700 aria-pressed:border-brand-800 aria-pressed:bg-brand-50 aria-pressed:text-brand-950 dark:aria-pressed:bg-brand-950 dark:aria-pressed:text-brand-100'
                  onClick={() => setInput(`${dollars}.00`)}
                  type='button'
                >
                  ${dollars}
                </button>
              ))}
            </fieldset>
          </div>
          <p className={amount ? "sr-only" : "text-sm text-destructive"} id='guest-purchase-range'>
            Enter $5.00 to $50.00.
          </p>
          <div className='mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground'>
            <Wallet aria-hidden className='size-3.5' />
            Receiving wallet{" "}
            <span className='font-mono' title={address}>
              {formatAddress(address)}
            </span>
          </div>
        </div>
        <Estimate key={requestedAmount} amount={requestedAmount} address={address} onOtherMethods={onOtherMethods} />
      </DialogContent>
    </Dialog>
  );
}
