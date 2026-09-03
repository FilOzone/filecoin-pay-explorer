"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { ArrowRight, Coins, CreditCard, Repeat, Wallet } from "lucide-react";
import type { ReactNode } from "react";

export type AddFundsMethod = "card" | "deposit" | "squid" | "usdc";

type AddFundsDialogProps = {
  /** "Buy USDC with card", or the log-in variant when there is no Privy session. */
  cardLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (method: AddFundsMethod) => void;
  open: boolean;
  /** Card and USDC payments deposit into Filecoin mainnet, so they are hidden elsewhere. */
  squidAvailable: boolean;
  squidDisabledReason?: string;
  /** The guided swap needs the dashboard that owns it; defaults to `squidAvailable`. */
  swapAvailable?: boolean;
};

const cardBase = "group relative flex items-start gap-4 rounded-lg border p-4 text-left transition-colors";
const enabledCard = `${cardBase} hover:border-primary hover:bg-muted/50`;
const disabledCard = `${cardBase} border-dashed bg-muted/30`;
const iconEnabled = "mt-0.5 rounded-md bg-primary/10 p-2 text-primary";
const iconDisabled = "mt-0.5 rounded-md bg-muted p-2 text-muted-foreground";

type FundingMethodCardProps = {
  /** Replaces the arrow when the method is unavailable, e.g. "Testnet". */
  badge?: string;
  description: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
};

function FundingMethodCard({ badge, description, disabled = false, icon, label, onSelect }: FundingMethodCardProps) {
  return (
    <div className={disabled ? disabledCard : enabledCard}>
      {/* Stretched button keeps the whole card clickable without nesting
          interactive elements inside a <button>. */}
      <button
        aria-label={label}
        className={`absolute inset-0 rounded-lg ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        disabled={disabled}
        onClick={onSelect}
        type='button'
      />
      <span className={disabled ? iconDisabled : iconEnabled}>{icon}</span>
      <span className='flex-1'>
        <span className='flex items-center justify-between font-medium'>
          {label}
          {badge ? (
            <span className='rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground'>{badge}</span>
          ) : (
            <ArrowRight className='h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
          )}
        </span>
        <span className='mt-1 block text-sm text-muted-foreground'>{description}</span>
      </span>
    </div>
  );
}

/** The one place funding methods are named, reached from every "Add funds" action. */
export function AddFundsDialog({
  cardLabel = "Buy USDC with card",
  onOpenChange,
  onSelect,
  open,
  squidAvailable,
  squidDisabledReason,
  swapAvailable = squidAvailable,
}: AddFundsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Choose how to add funds to your Filecoin Pay account.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {squidAvailable && (
            <>
              <FundingMethodCard
                description='Buy USDC by card, then pay it into your account.'
                icon={<CreditCard className='h-5 w-5' />}
                label={cardLabel}
                onSelect={() => onSelect("card")}
              />
              <FundingMethodCard
                description='From another network where you hold USDC. It arrives as USDFC in your account, with nothing to sign on Filecoin.'
                icon={<Coins className='h-5 w-5' />}
                label='Pay with USDC'
                onSelect={() => onSelect("usdc")}
              />
            </>
          )}
          <FundingMethodCard
            description='Already hold USDFC or another token on Filecoin? Deposit it directly.'
            icon={<Wallet className='h-5 w-5' />}
            label='Deposit USDFC'
            onSelect={() => onSelect("deposit")}
          />
          <p className='mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Other ways</p>
          <FundingMethodCard
            badge={squidAvailable ? undefined : "Testnet"}
            description={
              swapAvailable
                ? "Swap ETH, USDC and more from another network into USDFC, then deposit it."
                : (squidDisabledReason ?? "Available on Filecoin mainnet.")
            }
            disabled={!swapAvailable}
            icon={<Repeat className='h-5 w-5' />}
            label='Swap another token'
            onSelect={() => onSelect("squid")}
          />
        </div>
        <p className='text-xs text-muted-foreground'>Card purchases run through Privy; swaps run through Squid.</p>
      </DialogContent>
    </Dialog>
  );
}
