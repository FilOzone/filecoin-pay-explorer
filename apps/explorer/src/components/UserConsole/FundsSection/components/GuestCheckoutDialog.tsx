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
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { type Address, formatUnits, parseUnits } from "viem";
import type { GuestCoinbaseQuote } from "@/app/api/coinbase/quote/quote";
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
  const token = await getIdentityToken();
  if (!token) throw new Error("Your sign-in could not be verified. Sign in again to check this estimate.");
  const response = await fetch("/api/coinbase/quote", {
    body: JSON.stringify({ address, paymentAmount: amount }),
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Coinbase could not provide an estimate. Try again.",
    );
  }
  return body;
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='break-all font-medium tabular-nums'>{value}</dd>
    </div>
  );
}

function ConversionTerms({ estimate }: { estimate: GuestRouteEstimate }) {
  const { expiresAt } = estimate;
  const [expired, setExpired] = useState(() => Date.now() >= expiresAt);
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (expired) return <p role='status'>The Squid estimate expired. Refresh to see current proceeds.</p>;
  return (
    <>
      <dl className='grid gap-2 rounded-md border p-3'>
        <QuoteRow label='Base USDC to convert' value={`${formatUnits(estimate.sourceSpendUsdc, 6)} USDC`} />
        <QuoteRow
          label='Held for Base gas and bridge fees'
          value={`Up to ${formatUnits(estimate.networkReserveUsdc, 6)} USDC`}
        />
        <QuoteRow
          label='Bridge fee within that budget'
          value={`Up to ${formatUnits(estimate.bridgeFeeUsdc, 6)} USDC`}
        />
        <QuoteRow label='USDFC budget for FIL' value={`${formatUnits(estimate.filSpendUsdfc, 18)} USDFC`} />
        <QuoteRow label='FIL for wallet network fees' value={`${formatUnits(estimate.minimumFil, 18)} FIL`} />
        <QuoteRow
          label='Minimum Filecoin Pay deposit'
          value={formatTokenTruncated(estimate.minimumDepositUsdfc, 18, "USDFC", 6)}
        />
      </dl>
      <p role='status'>{estimate.paymentBlocker}</p>
    </>
  );
}

function Estimate({ address, amount }: { address: Address; amount: string }) {
  const coinbase = useQuery({
    queryKey: ["guest-coinbase-quote", address, amount],
    queryFn: ({ signal }) => getCoinbaseQuote(address, amount, signal),
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

  return (
    <section className='grid gap-3 text-sm' aria-label='Top-up estimate' aria-live='polite'>
      {coinbase.isFetching && <p role='status'>Getting your Coinbase estimate…</p>}
      {!coinbase.isFetching && coinbase.error && <p role='alert'>{coinbase.error.message}</p>}
      {quote && (
        <>
          <dl className='grid gap-2 rounded-md border p-3'>
            <QuoteRow label='Total charge' value={`$${quote.paymentTotal}`} />
            <QuoteRow label='Coinbase fees' value={`$${quote.feeTotal}`} />
            <QuoteRow label='Your wallet receives on Base' value={`${quote.purchaseAmount} USDC`} />
          </dl>
          {route.isFetching && <p role='status'>Checking your Filecoin Pay deposit, FIL reserve and Base fees…</p>}
          {!route.isFetching && route.error && <p role='alert'>{route.error.message}</p>}
          {!route.isFetching && route.isSuccess && (
            <ConversionTerms key={`${route.data.quoteId}-${route.data.expiresAt}`} estimate={route.data} />
          )}
        </>
      )}
      <Button
        disabled={coinbase.isFetching || route.isFetching}
        onClick={() => void coinbase.refetch()}
        size='compact'
        type='button'
        variant='tertiary'
      >
        Refresh estimate
      </Button>
    </section>
  );
}

export default function GuestCheckoutDialog({ address, onClose, onOtherMethods }: GuestCheckoutProps) {
  const [input, setInput] = useState("5.00");
  const amount = paymentAmount(input);
  const [debouncedAmount] = useDebounce(amount, 400);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Coinbase Apple Pay estimate</DialogTitle>
          <DialogDescription>
            Preview a US guest purchase and the conversion into Filecoin Pay before verifying your details. This sandbox
            preview can only request estimates.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-2'>
          <Label htmlFor='guest-purchase-amount'>Purchase amount (USD)</Label>
          <Input
            aria-describedby='guest-purchase-range'
            aria-invalid={!amount}
            id='guest-purchase-amount'
            inputMode='decimal'
            maxLength={5}
            onChange={(event) => setInput(event.target.value)}
            value={input}
          />
          <p className='text-xs text-muted-foreground' id='guest-purchase-range'>
            Enter $5.00 to $50.00.
          </p>
        </div>
        <p className='text-sm text-muted-foreground'>
          Receiving wallet{" "}
          <span className='font-mono' title={address}>
            {formatAddress(address)}
          </span>
        </p>
        {amount && amount === debouncedAmount ? <Estimate key={amount} address={address} amount={amount} /> : null}
        <DialogFooter>
          <Button onClick={onOtherMethods} type='button' variant='primary'>
            Other funding options
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
