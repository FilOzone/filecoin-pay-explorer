"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { clsx } from "clsx";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  CreditCard,
  type LucideIcon,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, useId } from "react";
import USDFCLogo from "@/assests/USDFCLogo";

export type AddFundsMethod = "card" | "deposit" | "squid" | "guest";

type AddFundsDialogProps = {
  guestAvailable?: boolean;
  cardFirst?: boolean;
  cardLabel?: string;
  cardStatus?: string | null;
  /** Privy's sign-in or purchase window is open over the picker. */
  isBusy?: boolean;
  /** A balance check for a card purchase is running; only the card waits for it. */
  isCardChecking?: boolean;
  /** Present while a card purchase is still being tracked; discards it after a confirmation. */
  onCardStartOver?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (method: AddFundsMethod) => void;
  open: boolean;
  squidAvailable: boolean;
  squidDisabledReason?: string;
};

type MethodCardProps = {
  action?: ReactNode;
  artwork?: ReactNode;
  description: ReactNode;
  disabled?: boolean;
  icon: LucideIcon;
  isAvailable?: boolean;
  label: string;
  note?: ReactNode;
  onSelect: () => void;
  status?: string | null;
};

function MethodCard({
  action,
  artwork,
  description,
  disabled = false,
  icon: Icon,
  isAvailable = true,
  label,
  note,
  onSelect,
  status,
}: MethodCardProps) {
  const descriptionId = useId();
  const featured = Boolean(artwork);
  return (
    <div
      className={clsx(
        "group relative isolate grid min-w-0 content-start transition-colors",
        featured
          ? "grid-cols-[minmax(0,1fr)_3.75rem] items-center gap-x-1.5 overflow-hidden rounded-2xl bg-linear-to-br from-[#142e63] via-[#133d78] to-[#16568d] p-4 text-white sm:grid-cols-[minmax(0,1fr)_7.25rem] sm:gap-x-2 sm:p-5"
          : "grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-2 sm:p-4",
        !featured && isAvailable && !disabled && "hover:border-brand-600 hover:bg-muted/30",
        !isAvailable && "bg-muted/45",
      )}
    >
      {/* The large hit target leaves the provider link and the purchase recovery action as separate controls. */}
      <button
        aria-describedby={descriptionId}
        aria-label={label}
        className={clsx(
          "peer absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-4",
          featured ? "enabled:hover:bg-white/5 focus-visible:outline-white" : "focus-visible:outline-brand-700",
          isAvailable ? "cursor-pointer disabled:cursor-wait" : "cursor-not-allowed",
        )}
        disabled={disabled || !isAvailable}
        onClick={onSelect}
        type='button'
      />
      {!featured && (
        <span className='col-start-1 row-start-1 row-span-2 grid size-8 peer-disabled:opacity-60 place-items-center rounded-lg bg-brand-50 text-brand-900 sm:row-span-1 sm:mb-3 dark:bg-brand-950/65 dark:text-brand-200'>
          <Icon aria-hidden='true' className='size-[17px]' />
        </span>
      )}
      <span
        className={clsx(
          "font-semibold tracking-tight peer-disabled:opacity-65",
          featured
            ? "col-start-1 row-start-1 self-end text-[1.24rem] leading-tight sm:text-[1.45rem]"
            : "col-start-2 row-start-1 text-[0.95rem] leading-5 sm:col-span-2 sm:col-start-1 sm:row-start-2",
        )}
      >
        {label}
      </span>
      <span
        className={clsx(
          "min-w-0",
          featured
            ? "col-start-1 row-start-2 self-start pt-1.5 text-[0.85rem] leading-5 text-blue-50 sm:max-w-[32ch] sm:text-sm"
            : "col-start-2 row-start-2 pt-1 text-[0.82rem] leading-[1.22rem] text-muted-foreground sm:col-span-2 sm:col-start-1 sm:row-start-3",
        )}
        id={descriptionId}
      >
        {description}
        {note && (
          <span className={clsx("mt-2 flex items-center gap-1.5 text-xs font-medium", featured && "text-blue-100")}>
            {note}
          </span>
        )}
      </span>
      {featured ? (
        <div
          aria-hidden='true'
          className='pointer-events-none relative col-start-2 row-span-2 row-start-1 self-center peer-disabled:opacity-50'
        >
          {artwork}
        </div>
      ) : null}
      {isAvailable ? (
        <span
          aria-hidden='true'
          className={clsx(
            "grid place-items-center peer-disabled:invisible",
            featured
              ? "relative col-start-2 row-span-2 row-start-1 size-6 translate-x-1 translate-y-1 self-end justify-self-end rounded-full bg-white text-[#133d78] sm:size-7"
              : "col-start-3 row-start-1 size-6 text-muted-foreground sm:col-start-2 sm:justify-self-end",
          )}
        >
          <ArrowRight className='size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5' />
        </span>
      ) : (
        <span className='col-start-3 row-start-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:col-start-2'>
          Testnet
        </span>
      )}
      {status || action ? (
        <div
          className={clsx("col-span-full mt-3 border-t pt-2 text-sm", featured ? "border-white/20" : "border-border")}
        >
          {status && <p role='status'>{status}</p>}
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function AddFundsDialog({
  guestAvailable = false,
  cardFirst = false,
  cardLabel = "Buy with a card",
  cardStatus,
  isBusy = false,
  isCardChecking = false,
  onCardStartOver,
  onOpenChange,
  onSelect,
  open,
  squidAvailable,
  squidDisabledReason,
}: AddFundsDialogProps) {
  // Keep the picker mounted while Privy's window owns the purchase.
  const handleOpenChange = (next: boolean) => {
    if (!next && isBusy) return;
    onOpenChange(next);
  };
  const guestDescriptionId = useId();
  const showCardFirst = cardFirst || !squidAvailable;
  const cardMethod = (
    <MethodCard
      action={
        onCardStartOver && (
          <button
            className='relative z-20 mt-1 min-h-8 rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2'
            disabled={isBusy}
            onClick={() => {
              if (
                window.confirm(
                  "Discard the pending card purchase? USDC that still arrives stays in the wallet on Base.",
                )
              )
                onCardStartOver();
            }}
            type='button'
          >
            Start over
          </button>
        )
      }
      artwork={
        showCardFirst ? (
          <Image
            alt=''
            className='h-auto w-full'
            height={128}
            sizes='(min-width: 640px) 116px, 60px'
            src='/console/funding-card.webp'
            width={128}
          />
        ) : null
      }
      description='Receive USDC on Base, then convert it to USDFC for Filecoin Pay.'
      disabled={isBusy || isCardChecking}
      icon={CreditCard}
      label={cardLabel}
      note={
        <>
          <ShieldCheck aria-hidden='true' className='size-3.5 shrink-0' /> Identity verification required
        </>
      }
      onSelect={() => onSelect("card")}
      status={cardStatus}
    />
  );
  const swapMethod = (
    <MethodCard
      artwork={
        showCardFirst ? null : (
          <span className='relative mx-auto grid aspect-square w-3/4 place-items-center rounded-full border border-white/20 bg-white/5 shadow-lg'>
            <USDFCLogo className='size-3/4 -rotate-12' />
            <span className='absolute -bottom-1 left-0 grid size-5 place-items-center rounded-full bg-blue-100 text-brand-950 sm:size-8'>
              <ArrowRightLeft className='size-3 sm:size-4' />
            </span>
          </span>
        )
      }
      description={
        squidAvailable ? (
          <>
            Convert supported tokens to USDFC and fund Filecoin Pay with{" "}
            <a
              className='relative z-20 rounded-sm font-medium underline underline-offset-2 focus-visible:outline-2'
              href='https://app.squidrouter.com/'
              rel='noopener noreferrer'
              target='_blank'
            >
              Squid
            </a>
            .
          </>
        ) : (
          (squidDisabledReason ?? "Available on Filecoin mainnet.")
        )
      }
      disabled={isBusy}
      icon={ArrowRightLeft}
      isAvailable={squidAvailable}
      label='Swap from another network'
      onSelect={() => onSelect("squid")}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto overscroll-contain rounded-3xl p-4 shadow-2xl sm:max-w-[540px] sm:gap-5 sm:p-6'>
        <DialogHeader className='gap-1.5 pr-7 text-left'>
          <DialogTitle className='text-[1.7rem] leading-tight tracking-tight sm:text-3xl'>Add funds</DialogTitle>
          <DialogDescription>Fund the balance you use for Filecoin services.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-2'>
          {showCardFirst ? cardMethod : swapMethod}
          {guestAvailable && (
            <button
              aria-describedby={guestDescriptionId}
              aria-label='Preview Apple Pay top-up'
              className='group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 text-left text-brand-950 transition-colors enabled:cursor-pointer enabled:hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-70 sm:gap-3 sm:px-4 dark:border-brand-900 dark:bg-brand-950/45 dark:text-brand-100'
              disabled={isBusy}
              onClick={() => onSelect("guest")}
              type='button'
            >
              <Smartphone aria-hidden='true' className='size-5' />
              <span>
                <span className='block text-sm font-semibold'>Preview Apple Pay top-up</span>
                <span className='mt-0.5 block text-xs leading-[1.1rem]' id={guestDescriptionId}>
                  Coinbase estimate only · $5–$50 for US guests
                </span>
              </span>
              <ArrowRight
                aria-hidden='true'
                className='size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5'
              />
            </button>
          )}
        </div>
        <div className='grid gap-2.5'>
          <h3 className='text-sm font-semibold'>
            {showCardFirst ? "Use crypto you already own" : "More funding options"}
          </h3>
          <div className='grid gap-2 sm:grid-cols-2 sm:gap-3'>
            {showCardFirst ? swapMethod : cardMethod}
            <MethodCard
              description='Move USDFC or another Filecoin token into your Pay balance.'
              disabled={isBusy}
              icon={ArrowDownToLine}
              label='Deposit from Filecoin'
              onSelect={() => onSelect("deposit")}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
