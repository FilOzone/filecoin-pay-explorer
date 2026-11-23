"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, CreditCard } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { type GuestCoinbaseQuote, isRecord } from "@/app/api/coinbase/quote/quote";
import CoinbasePayment from "./CoinbasePayment";
import { type Attempt, isOrder, isQuote, readAttempt, sameQuote } from "./session";

async function requestSandbox(address: Address, action: "quote" | "order", attemptId?: string): Promise<unknown> {
  const response = await fetch("/api/coinbase/sandbox", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, action, acceptedTerms: true, attemptId }),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(body) && typeof body.error === "string" ? body.error : "Coinbase couldn’t return a sandbox response.",
    );
  return body;
}

function Receipt({ quote }: { quote: GuestCoinbaseQuote }) {
  return (
    <dl className='grid gap-3 rounded-xl border bg-card px-4 py-4 text-sm'>
      <div className='flex items-baseline justify-between gap-4 font-semibold'>
        <dt>Simulated purchase total</dt>
        <dd className='text-xl tabular-nums'>${quote.paymentTotal}</dd>
      </div>
      <div className='flex items-baseline justify-between gap-4'>
        <dt>Coinbase fees</dt>
        <dd className='tabular-nums'>${quote.feeTotal}</dd>
      </div>
      <div className='flex items-baseline justify-between gap-4 border-t pt-3'>
        <dt>USDC on Base</dt>
        <dd className='font-semibold tabular-nums'>{quote.purchaseAmount} USDC</dd>
      </div>
    </dl>
  );
}

export default function ApplePaySandbox({
  address,
  example,
  configured,
}: {
  address: Address;
  example: boolean;
  configured: boolean;
}) {
  const storageKey = `filecoin-pay:apple-pay-sandbox:v1:${address.toLowerCase()}`;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const locked = useRef(false);
  const current = useRef<Attempt | null>(null);
  useEffect(() => {
    try {
      current.current = readAttempt(storageKey);
      setAttempt(current.current);
      setAccepted(!!current.current);
    } catch {
      setStorageError(
        "The saved test session could not be read. Enable tab storage or open a fresh tab before starting a separate test.",
      );
    }
    setRestored(true);
  }, [storageKey]);

  const save = useCallback(
    (next: Attempt) => {
      // Persist the same short-lived sandbox session only in this tab. The payment URL never enters navigation or logs.
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      current.current = next;
      setAttempt(next);
    },
    [storageKey],
  );

  const pricing = useMutation({
    mutationFn: async () => {
      const reply = await requestSandbox(address, "quote");
      if (!isRecord(reply) || !isQuote(reply.quote)) throw new Error("Coinbase returned an incomplete $5 quote.");
      return reply.quote;
    },
    retry: false,
  });
  const create = useMutation({
    mutationFn: async (approved: GuestCoinbaseQuote) => {
      const attemptId = crypto.randomUUID();
      try {
        save({ attemptId, approved, status: "creating" });
      } catch {
        throw new Error("Enable tab storage to keep this test payment recoverable.");
      }
      const reply = await requestSandbox(address, "order", attemptId);
      if (!isOrder(reply)) throw new Error("Coinbase did not return a valid sandbox payment link.");
      save({
        attemptId,
        approved,
        status: "open",
        order: { orderId: reply.orderId, paymentUrl: reply.paymentUrl, quote: reply.quote },
      });
    },
    retry: false,
  });

  function getQuote() {
    if (locked.current || current.current || !accepted) return;
    locked.current = true;
    pricing.mutate(undefined, {
      onSettled: () => {
        locked.current = false;
      },
    });
  }

  async function createOrder() {
    if (locked.current || current.current || !accepted || !pricing.data) return;
    locked.current = true;
    try {
      await create.mutateAsync(pricing.data);
    } catch {
      /* The mutation displays the error below. */
    } finally {
      locked.current = false;
    }
  }
  const update = useCallback(
    (status: "processing" | "complete") => {
      const existing = current.current;
      if (!existing?.order || existing.status === "complete" || existing.status === status) return;
      try {
        save({ ...existing, status });
      } catch {
        setStorageError("This tab could not save the payment update. Keep the order ID for reference.");
      }
    },
    [save],
  );
  function startAnotherTest() {
    if (current.current?.status !== "complete") return;
    try {
      sessionStorage.removeItem(storageKey);
      current.current = null;
      setAttempt(null);
      setAccepted(false);
      setStorageError("");
      pricing.reset();
      create.reset();
    } catch {
      setStorageError("This tab could not clear the completed test.");
    }
  }

  const onApproved = useCallback(() => update("processing"), [update]);
  const onComplete = useCallback(() => update("complete"), [update]);
  const order = attempt?.order;
  const changed = !!order && !!attempt && !sameQuote(order.quote, attempt.approved);
  const quote = order?.quote ?? attempt?.approved ?? pricing.data;
  const error = storageError || create.error?.message || pricing.error?.message;

  return (
    <div className='bg-background px-4 py-8 text-foreground sm:px-6 sm:py-14'>
      <section
        className='mx-auto grid max-w-lg gap-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-8'
        aria-labelledby='apple-pay-sandbox-title'
      >
        <header className='grid gap-2 rounded-2xl bg-linear-to-br from-[#122a56] to-[#185689] p-5 text-white'>
          <CreditCard aria-hidden className='mb-1 size-6' />
          <h1 id='apple-pay-sandbox-title' className='text-3xl font-semibold tracking-tight'>
            Apple Pay sandbox
          </h1>
          <p className='text-sm leading-5 text-blue-50'>
            Try a $5 purchase of USDC on Base using simulated funds. Your card charge is $0.
          </p>
        </header>
        <div className='grid gap-1 text-sm'>
          <span className='font-medium'>{example ? "Example destination" : "Test destination"}</span>
          <span className='break-all font-mono text-xs leading-5 text-muted-foreground'>{address}</span>
        </div>
        {!configured && !attempt && !quote && (
          <aside
            aria-label='Local server setup'
            className='grid gap-1 rounded-xl border bg-muted p-4 text-sm leading-5'
          >
            <h2 className='font-semibold'>Connect your Coinbase project</h2>
            <p>
              The local server is waiting for <code>CDP_API_KEY_ID</code> and <code>CDP_API_KEY_SECRET</code>. Save both
              in <code>apps/explorer/.env.local</code>, then reload this page.
            </p>
            <a
              className='w-fit font-medium underline underline-offset-2'
              href='https://portal.cdp.coinbase.com/api-keys/secret'
              target='_blank'
              rel='noreferrer'
            >
              Open CDP Secret API Keys
            </a>
          </aside>
        )}
        {!attempt && (
          <div className='grid gap-3'>
            <p className='text-sm leading-5 text-muted-foreground'>
              The simulator uses a fictional US phone number and email. It skips contact and ID verification.
            </p>
            <label className='flex cursor-pointer items-start gap-3 text-sm leading-5'>
              <input
                type='checkbox'
                className='mt-0.5 size-4 shrink-0 accent-blue-700'
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              I accept Coinbase’s terms for this test order
            </label>
            <div className='flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-2'>
              <a href='https://www.coinbase.com/legal/guest-checkout/us' target='_blank' rel='noreferrer'>
                Guest Checkout Terms
              </a>
              <a href='https://www.coinbase.com/legal/user_agreement' target='_blank' rel='noreferrer'>
                User Agreement
              </a>
              <a href='https://www.coinbase.com/legal/privacy' target='_blank' rel='noreferrer'>
                Privacy Policy
              </a>
            </div>
          </div>
        )}
        {!restored && <p role='status'>Restoring your test session…</p>}
        {quote && (
          <section className='grid gap-2' aria-label='Sandbox quote'>
            <h2 className='font-semibold'>{changed ? "Review updated quote" : "Coinbase sandbox quote"}</h2>
            {changed && (
              <p className='text-sm leading-5 text-muted-foreground'>
                Coinbase changed the amounts when it created this order. Your previous quote included $
                {attempt.approved.feeTotal} in fees and {attempt.approved.purchaseAmount} USDC.
              </p>
            )}
            <Receipt quote={quote} />
          </section>
        )}
        {error && (
          <p role='alert' className='rounded-lg border border-destructive/30 p-3 text-sm'>
            {error}
          </p>
        )}
        {restored &&
          !storageError &&
          !attempt &&
          (!quote ? (
            <Button disabled={!accepted || pricing.isPending} onClick={getQuote} variant='primary' type='button'>
              {pricing.isPending ? "Getting sandbox quote…" : "Get $5 sandbox quote"}
            </Button>
          ) : (
            <Button
              disabled={!accepted || create.isPending}
              onClick={() => void createOrder()}
              variant='primary'
              type='button'
            >
              Create sandbox order
            </Button>
          ))}
        {attempt?.status === "creating" && (
          <p role='status' className='text-sm'>
            {create.isPending
              ? "Creating your sandbox order…"
              : "This tab already requested an order. Its outcome is unknown, so it won’t send another order request."}
          </p>
        )}
        {changed && (
          <Button
            onClick={() => {
              try {
                save({ ...attempt, approved: order.quote });
              } catch {
                setStorageError("This tab could not save the updated quote approval.");
              }
            }}
            disabled={!!storageError}
            variant='primary'
            type='button'
          >
            Accept updated quote
          </Button>
        )}
        {order && !changed && attempt?.status !== "complete" && (
          <CoinbasePayment
            paymentUrl={order.paymentUrl}
            processing={attempt?.status === "processing"}
            onApproved={onApproved}
            onComplete={onComplete}
          />
        )}
        {attempt?.status === "complete" && (
          <div role='status' className='flex gap-3 rounded-xl border bg-muted p-4'>
            <CheckCircle2 aria-hidden className='size-5 shrink-0' />
            <div>
              <h2 className='font-semibold'>Sandbox payment complete</h2>
              <p className='mt-1 text-sm'>Coinbase confirmed the simulated purchase. Your card charge is $0.</p>
            </div>
          </div>
        )}
        {attempt?.status === "complete" && (
          <Button onClick={startAnotherTest} type='button' variant='primary'>
            Start another test
          </Button>
        )}
        {order && (
          <p className='break-all text-xs text-muted-foreground'>
            Sandbox order ID <span className='font-mono'>{order.orderId}</span>
          </p>
        )}
      </section>
    </div>
  );
}
