"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import GuestCheckoutReceipt from "@/components/UserConsole/FundsSection/components/GuestCheckoutReceipt";

const steps = {
  review: {
    title: "Review the example purchase",
    description:
      "The receipt shows what the $5 purchase could put in Filecoin Pay after fees. Try the payment step when you’re ready.",
    action: "Simulate $5 payment approval",
    next: "approved",
    progress: 0,
  },
  approved: {
    title: "Demo payment approved",
    description:
      "The example purchase is now USDC on Base. Approve the conversion to set aside FIL for network fees and deposit the remaining USDFC into Filecoin Pay.",
    action: "Approve simulated conversion",
    next: "converting",
    progress: 1,
  },
  converting: {
    title: "Demo conversion in progress",
    description:
      "You approved the example conversion. In a funded checkout, the account becomes usable once the Filecoin deposit confirms.",
    action: "Show deposit confirmation",
    next: "confirmed",
    progress: 2,
  },
  confirmed: {
    title: "Demo deposit confirmed",
    description:
      "The example USDFC deposit and FIL reserve are complete. Your actual Filecoin Pay balance is unchanged.",
    action: "Restart walkthrough",
    next: "review",
    progress: 3,
  },
} as const;

type Stage = keyof typeof steps;

export default function PreviewApplePayDemo({ address, example }: { address: Address; example: boolean }) {
  const storageKey = `filecoin-pay:preview-walkthrough:v1:${address.toLowerCase()}`;
  const [session, setSession] = useState<{ key: string; stage: Stage } | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const stage = session?.key === storageKey ? session.stage : null;
  const step = stage && steps[stage];

  useEffect(() => {
    let restored: Stage = "review";
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === "approved" || saved === "converting" || saved === "confirmed") restored = saved;
    } catch {
      setStorageUnavailable(true);
    }
    setSession({ key: storageKey, stage: restored });
  }, [storageKey]);

  function advance(next: Stage) {
    try {
      if (next === "review") sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, next);
    } catch {
      setStorageUnavailable(true);
    }
    setSession({ key: storageKey, stage: next });
  }

  return (
    <div className='min-w-0 bg-background px-4 py-6 text-foreground sm:px-8 sm:py-12'>
      <div className='mx-auto grid max-w-4xl gap-5 sm:gap-7'>
        <Link
          href='/console'
          prefetch={false}
          className='flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-700'
        >
          <ArrowLeft aria-hidden className='size-4' /> Back to console
        </Link>
        <header className='grid gap-2'>
          <h1 className='text-3xl leading-tight font-semibold tracking-tight sm:text-4xl'>Try a $5 Apple Pay top-up</h1>
          <p className='max-w-[58ch] text-sm leading-6 text-muted-foreground sm:text-base'>
            This Filecoin Pay walkthrough uses sample prices and simulated approvals. Your card charge is{" "}
            <strong className='font-semibold text-foreground'>$0</strong> and your wallet balance stays the same.
          </p>
        </header>
        <div className='grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-6'>
          <section aria-label='Example receipt'>
            <GuestCheckoutReceipt mode='example' />
          </section>
          <section
            aria-label='Walkthrough controls'
            className='grid min-w-0 gap-5 rounded-2xl border bg-card p-4 sm:p-6'
          >
            <ol className='flex gap-2' aria-label='Funding progress'>
              {["Payment", "Conversion", "Deposit"].map((label, index) => {
                const current = step?.progress ?? 0;
                return (
                  <li
                    key={label}
                    aria-current={index === current ? "step" : undefined}
                    className='grid min-w-0 flex-1 gap-1.5'
                  >
                    <span
                      aria-hidden
                      data-current={index === current}
                      data-complete={index < current}
                      className='h-1 rounded-full bg-muted data-[complete=true]:bg-brand-700 data-[current=true]:bg-brand-400'
                    />
                    <span className='flex items-center gap-1 text-xs font-medium'>
                      {index < current && <Check aria-label='Complete' className='size-3' />}
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className='grid gap-1.5' aria-live='polite' aria-atomic='true'>
              {step ? (
                <>
                  <h2 className='text-xl font-semibold tracking-tight'>{step.title}</h2>
                  <p className='text-sm leading-5 text-muted-foreground'>{step.description}</p>
                </>
              ) : (
                <p className='text-sm text-muted-foreground'>Restoring walkthrough…</p>
              )}
            </div>
            {step && (
              <Button type='button' variant='primary' onClick={() => advance(step.next)}>
                <span className='flex items-center justify-center gap-2'>
                  {step.action}
                  {stage === "confirmed" ? (
                    <RotateCcw aria-hidden className='size-4' />
                  ) : (
                    <ArrowRight aria-hidden className='size-4' />
                  )}
                </span>
              </Button>
            )}
            <div className='border-t pt-4'>
              <p className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Wallet aria-hidden className='size-3.5' />
                {example ? "Example destination" : "Wallet in this walkthrough"}
              </p>
              <p className='mt-1.5 break-all font-mono text-xs leading-5'>{address}</p>
            </div>
            <a
              className='w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground'
              href='https://onramp-demo-application-git-main-coinbase-vercel.vercel.app/apple-pay'
              target='_blank'
              rel='noopener noreferrer'
            >
              Open Coinbase’s separate payment demo
            </a>
            {storageUnavailable && (
              <p role='status' className='text-xs text-muted-foreground'>
                Browser storage is unavailable. Refreshing will restart this walkthrough.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
