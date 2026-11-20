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
import { ArrowRight, Clock3, Info, LoaderCircle, LockKeyhole, RotateCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { type Address, parseUnits } from "viem";
import type { GuestCoinbaseQuote } from "@/app/api/coinbase/quote/quote";
import { formatAddress } from "@/utils/formatter";
import { type GuestRouteEstimate, getGuestRouteEstimate } from "../data/guestRoute";
import GuestCheckoutReceipt from "./GuestCheckoutReceipt";

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

async function getCoinbaseQuote(
  address: Address,
  amount: string,
  signal: AbortSignal,
): Promise<GuestCoinbaseQuote | null> {
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
    if (body?.code === "sandbox_unconfigured") return null;
    throw new Error("Apple Pay estimates are unavailable right now. Try another funding option or check again later.");
  }
  if (!response.ok || !body) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Coinbase could not provide an estimate. Try again.",
    );
  }
  return body;
}

function QuoteNotice({ message, state }: { message: string; state: "blocked" | "error" | "expired" | "loading" }) {
  const loading = state === "loading";
  const Icon = { blocked: LockKeyhole, error: Info, expired: Clock3, loading: LoaderCircle }[state];
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
        {state === "blocked" && <p className='font-semibold'>Payment unavailable</p>}
        {state === "error" && <p className='font-semibold'>Couldn’t get an estimate</p>}
        <p className='leading-5'>{message}</p>
      </div>
    </div>
  );
}

function LiveReceipt({ quote, estimate }: { quote: GuestCoinbaseQuote; estimate?: GuestRouteEstimate }) {
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
      <GuestCheckoutReceipt mode='estimate' quote={quote} route={route} />
      {route && <QuoteNotice message={route.paymentBlocker} state='blocked' />}
      {expired && (
        <QuoteNotice message='The Squid estimate expired. Refresh to see current proceeds.' state='expired' />
      )}
    </>
  );
}

export default function GuestCheckoutDialog({ address, onClose, onOtherMethods }: GuestCheckoutProps) {
  const [input, setInput] = useState("5.00");
  const amount = paymentAmount(input);
  const [debouncedAmount] = useDebounce(amount, 400);
  const requestedAmount = amount === debouncedAmount ? amount : null;
  const coinbase = useQuery({
    queryKey: ["guest-coinbase-quote", address, requestedAmount],
    queryFn: requestedAmount ? ({ signal }) => getCoinbaseQuote(address, requestedAmount, signal) : skipToken,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const example = coinbase.isSuccess && coinbase.data === null;
  const quote = !coinbase.isFetching && coinbase.isSuccess ? coinbase.data : null;
  const purchaseAmount = quote?.purchaseAmount;
  const route = useQuery({
    queryKey: ["guest-filecoin-route", address, requestedAmount, purchaseAmount, coinbase.dataUpdatedAt],
    queryFn: purchaseAmount
      ? () => getGuestRouteEstimate({ wallet: address, receivedUsdc: parseUnits(purchaseAmount, 6) })
      : skipToken,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const estimate = !route.isFetching && route.isSuccess ? route.data : undefined;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className='max-h-[calc(100dvh-1.5rem)] min-w-0 gap-4 overflow-y-auto overscroll-contain rounded-3xl p-4 shadow-2xl sm:max-w-[540px] sm:gap-5 sm:p-6'>
        <DialogHeader className='gap-1.5 pr-5 text-left'>
          <DialogTitle className='text-[1.65rem] leading-tight font-semibold tracking-tight sm:text-[1.85rem]'>
            Coinbase Apple Pay estimate
          </DialogTitle>
          <DialogDescription className='max-w-[47ch] leading-5'>
            {example
              ? "These figures illustrate a $5 purchase. Live pricing needs a Coinbase sandbox connection."
              : "US guests can preview their Filecoin Pay deposit and fees before verification."}
          </DialogDescription>
        </DialogHeader>
        {!example && (
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
        )}
        <section className='grid min-w-0 gap-3' aria-label='Top-up estimate' aria-live='polite'>
          {example && <GuestCheckoutReceipt mode='example' />}
          {coinbase.isFetching && (
            <QuoteNotice
              state='loading'
              message={example ? "Checking live pricing…" : "Getting your Coinbase estimate…"}
            />
          )}
          {!coinbase.isFetching && coinbase.error && <QuoteNotice state='error' message={coinbase.error.message} />}
          {quote && (
            <>
              <LiveReceipt key={`${estimate?.quoteId}-${estimate?.expiresAt}`} quote={quote} estimate={estimate} />
              {route.isFetching && (
                <QuoteNotice state='loading' message='Checking Filecoin proceeds and network fees…' />
              )}
              {!route.isFetching && route.error && <QuoteNotice state='error' message={route.error.message} />}
            </>
          )}
        </section>
        <DialogFooter className='gap-2 sm:items-center sm:justify-between'>
          <Button
            disabled={!requestedAmount || coinbase.isFetching || route.isFetching}
            onClick={() => void coinbase.refetch()}
            size='compact'
            type='button'
            variant='tertiary'
          >
            <span className='inline-flex items-center justify-center gap-2'>
              <RotateCw aria-hidden className='size-3.5' />
              {example ? "Check live pricing" : "Refresh estimate"}
            </span>
          </Button>
          <Button onClick={onOtherMethods} size='compact' type='button' variant='primary'>
            <span className='inline-flex items-center justify-center gap-2'>
              Other funding options <ArrowRight aria-hidden className='size-4' />
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
