"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { clsx } from "clsx";
import { ArrowRight, CreditCard, type LucideIcon, Repeat, Smartphone, Wallet } from "lucide-react";
import { type ReactNode, useId } from "react";

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
  description: ReactNode;
  disabled?: boolean;
  icon: LucideIcon;
  isAvailable?: boolean;
  label: string;
  onSelect: () => void;
  status?: string | null;
  unavailableBadge?: string;
};

function MethodCard({
  action,
  description,
  disabled = false,
  icon: Icon,
  isAvailable = true,
  label,
  onSelect,
  status,
  unavailableBadge,
}: MethodCardProps) {
  const descriptionId = useId();
  return (
    <div
      className={clsx(
        "group relative flex items-start gap-3 px-3.5 py-4 transition-colors sm:gap-4 sm:px-5",
        !isAvailable && "bg-muted/40",
        isAvailable && !disabled && "hover:bg-muted/50",
      )}
    >
      {/* Stretched button keeps the whole card clickable without nesting
          interactive elements inside a <button>. */}
      <button
        aria-describedby={descriptionId}
        aria-label={label}
        className={clsx(
          "absolute inset-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700",
          isAvailable ? "cursor-pointer disabled:cursor-wait" : "cursor-not-allowed",
        )}
        disabled={disabled || !isAvailable}
        onClick={onSelect}
        type='button'
      />
      <span className='grid size-9 shrink-0 place-items-center rounded-xl border bg-background text-foreground sm:size-10'>
        <Icon aria-hidden='true' className='size-[18px]' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='flex items-center justify-between gap-2 text-base font-semibold leading-snug tracking-tight'>
          {label}
          {isAvailable ? (
            <ArrowRight
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5'
            />
          ) : (
            <span className='rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground'>
              {unavailableBadge}
            </span>
          )}
        </span>
        <span className='mt-1 block text-sm leading-5 text-muted-foreground' id={descriptionId}>
          {description}
        </span>
        {status ? (
          <span className='mt-2 block border-l-2 border-brand-700 pl-2 text-sm text-foreground' role='status'>
            {status}
          </span>
        ) : null}
        {action}
      </span>
    </div>
  );
}

export function AddFundsDialog({
  guestAvailable = false,
  cardFirst = false,
  cardLabel = "Buy USDC with card",
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
  // While Privy's window is open, Escape, an outside click or the close button must not dismiss the
  // picker, which shows how the purchase ended and offers Start over.
  const handleOpenChange = (next: boolean) => {
    if (!next && isBusy) return;
    onOpenChange(next);
  };
  const guestDescriptionId = useId();
  const cardMethod = (
    <MethodCard
      action={
        onCardStartOver ? (
          // `relative` lifts the control above the stretched button so it stays clickable.
          <button
            className='relative mt-1 min-h-8 rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-700'
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
        ) : null
      }
      description='Buy USDC on Base, then swap and deposit it into Filecoin Pay. Requires identity verification.'
      disabled={isBusy || isCardChecking}
      icon={CreditCard}
      label={cardLabel}
      onSelect={() => onSelect("card")}
      status={cardStatus}
    />
  );
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto overscroll-contain rounded-2xl p-4 shadow-2xl sm:max-w-[540px] sm:gap-6 sm:p-7'>
        <DialogHeader className='gap-1.5 pr-6 text-left'>
          <DialogTitle className='text-3xl tracking-tight'>Add funds</DialogTitle>
          <DialogDescription>Choose how you want to fund your Filecoin Pay account.</DialogDescription>
        </DialogHeader>
        {guestAvailable && (
          <button
            aria-describedby={guestDescriptionId}
            aria-label='Preview Apple Pay top-up'
            className='group grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl bg-brand-900 p-4 text-left text-white transition-colors enabled:cursor-pointer enabled:hover:bg-brand-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-70 sm:gap-4 sm:p-5'
            disabled={isBusy}
            onClick={() => onSelect("guest")}
            type='button'
          >
            <span className='grid size-10 place-items-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-inset ring-white/20'>
              <Smartphone aria-hidden='true' className='size-5' />
            </span>
            <span className='min-w-0'>
              <span className='block text-lg font-semibold leading-tight tracking-tight'>Preview Apple Pay top-up</span>
              <span className='mt-1.5 block text-sm leading-5 text-brand-50' id={guestDescriptionId}>
                Get a Coinbase sandbox estimate for a $5–$50 US guest purchase.
              </span>
            </span>
            <ArrowRight
              aria-hidden='true'
              className='mt-1 size-5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5'
            />
          </button>
        )}
        <div className='divide-y overflow-hidden rounded-xl border'>
          {cardFirst ? cardMethod : null}
          <MethodCard
            description={
              squidAvailable ? (
                <>
                  Pay USDC from another chain and deposit the resulting USDFC directly into Filecoin Pay via{" "}
                  {/* `relative` lifts the link above the stretched button so it stays clickable. */}
                  <a
                    className='relative rounded-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-700'
                    href='https://app.squidrouter.com/'
                    rel='noopener noreferrer'
                    target='_blank'
                  >
                    Squid
                  </a>{" "}
                  to top up.
                </>
              ) : (
                (squidDisabledReason ?? "Available on Filecoin mainnet.")
              )
            }
            disabled={isBusy}
            icon={Repeat}
            isAvailable={squidAvailable}
            label='Swap to USDFC'
            onSelect={() => onSelect("squid")}
            unavailableBadge='Testnet'
          />
          {cardFirst ? null : cardMethod}
          <MethodCard
            description='Already hold USDFC or another token on Filecoin? Deposit it directly.'
            disabled={isBusy}
            icon={Wallet}
            label='Deposit token'
            onSelect={() => onSelect("deposit")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
