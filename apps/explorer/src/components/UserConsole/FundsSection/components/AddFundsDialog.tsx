"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { ArrowRight, Coins, CreditCard, Wallet } from "lucide-react";
import type { ReactNode } from "react";

export type AddFundsMethod = "card" | "crosschain" | "deposit";

type AddFundsDialogProps = {
  /** "Buy USDC with card", or the log-in variant when there is no Privy session. */
  cardLabel?: string;
  /** Card purchases and payments from other networks deposit into Filecoin mainnet, so they are hidden elsewhere. */
  crossChainAvailable: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (method: AddFundsMethod) => void;
  open: boolean;
};

const cardBase =
  "group relative flex items-start gap-4 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-muted/50";

type FundingMethodCardProps = {
  description: ReactNode;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
};

function FundingMethodCard({ description, icon, label, onSelect }: FundingMethodCardProps) {
  return (
    <div className={cardBase}>
      {/* Stretched button keeps the whole card clickable without nesting
          interactive elements inside a <button>. */}
      <button
        aria-label={label}
        className='absolute inset-0 cursor-pointer rounded-lg'
        onClick={onSelect}
        type='button'
      />
      <span className='mt-0.5 rounded-md bg-primary/10 p-2 text-primary'>{icon}</span>
      <span className='flex-1'>
        <span className='flex items-center justify-between font-medium'>
          {label}
          <ArrowRight className='h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
        </span>
        <span className='mt-1 block text-sm text-muted-foreground'>{description}</span>
      </span>
    </div>
  );
}

/** The one place funding methods are named, reached from every "Add funds" action. */
export function AddFundsDialog({
  cardLabel = "Buy USDC with card",
  crossChainAvailable,
  onOpenChange,
  onSelect,
  open,
}: AddFundsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Choose how to add funds to your Filecoin Pay account.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {crossChainAvailable && (
            <>
              <FundingMethodCard
                description='Buy USDC by card, then pay it into your account.'
                icon={<CreditCard className='h-5 w-5' />}
                label={cardLabel}
                onSelect={() => onSelect("card")}
              />
              <FundingMethodCard
                description='USDC by default, or another token you hold on Ethereum, Base, Arbitrum and more. It arrives as USDFC in your account, with nothing to sign on Filecoin.'
                icon={<Coins className='h-5 w-5' />}
                label='Pay from another network'
                onSelect={() => onSelect("crosschain")}
              />
            </>
          )}
          <FundingMethodCard
            description='Already hold USDFC or another token on Filecoin? Deposit it directly.'
            icon={<Wallet className='h-5 w-5' />}
            label='Deposit USDFC'
            onSelect={() => onSelect("deposit")}
          />
        </div>
        {crossChainAvailable && (
          <p className='text-xs text-muted-foreground'>
            Card purchases run through Privy; payments from other networks run through Squid.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
