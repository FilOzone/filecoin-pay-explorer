"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { ArrowRight, Loader2, Repeat, Wallet } from "lucide-react";

export type AddFundsMethod = "deposit" | "squid";

type AddFundsDialogProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: (method: AddFundsMethod) => void;
  open: boolean;
  squidAvailable: boolean;
  squidDisabledReason?: string;
  tokenSymbol: string;
  /** A guided top-up is already running; the Squid card opens it instead of starting a new one. */
  topUpInProgress?: boolean;
};

const cardBase = "group relative flex items-start gap-4 rounded-lg border p-4 text-left transition-colors";
const enabledCard = `${cardBase} hover:border-primary hover:bg-muted/50`;
const disabledCard = `${cardBase} border-dashed bg-muted/30`;
const iconEnabled = "mt-0.5 rounded-md bg-primary/10 p-2 text-primary";
const iconDisabled = "mt-0.5 rounded-md bg-muted p-2 text-muted-foreground";

export function AddFundsDialog({
  onOpenChange,
  onSelect,
  open,
  squidAvailable,
  squidDisabledReason,
  tokenSymbol,
  topUpInProgress = false,
}: AddFundsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Choose how you want to fund your Filecoin Pay account.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          <div className={enabledCard}>
            {/* Stretched button keeps the whole card clickable without nesting
                interactive elements inside a <button>. */}
            <button
              aria-label={`Deposit ${tokenSymbol}`}
              className='absolute inset-0 cursor-pointer rounded-lg'
              onClick={() => onSelect("deposit")}
              type='button'
            />
            <span className={iconEnabled}>
              <Wallet className='h-5 w-5' />
            </span>
            <span className='flex-1'>
              <span className='flex items-center justify-between font-medium'>
                Deposit {tokenSymbol}
                <ArrowRight className='h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
              </span>
              <span className='mt-1 block text-sm text-muted-foreground'>
                You already hold {tokenSymbol}, top up your account.
              </span>
            </span>
          </div>

          <div className={squidAvailable ? enabledCard : disabledCard}>
            <button
              aria-label={topUpInProgress ? "Top-up in progress — view" : "Fund with another token"}
              className={`absolute inset-0 rounded-lg ${squidAvailable ? "cursor-pointer" : "cursor-not-allowed"}`}
              disabled={!squidAvailable}
              onClick={() => onSelect("squid")}
              type='button'
            />
            <span className={squidAvailable ? iconEnabled : iconDisabled}>
              {topUpInProgress ? <Loader2 className='h-5 w-5 animate-spin' /> : <Repeat className='h-5 w-5' />}
            </span>
            <span className='flex-1'>
              <span className='flex items-center justify-between font-medium'>
                {topUpInProgress ? "Top-up in progress — view" : "Fund with another token"}
                {squidAvailable ? (
                  <ArrowRight className='h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
                ) : (
                  <span className='rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground'>
                    Testnet
                  </span>
                )}
              </span>
              <span className='mt-1 block text-sm text-muted-foreground'>
                {topUpInProgress ? (
                  "A top-up is already running. Open it to see progress; a new one can start after it finishes or is cleared."
                ) : squidAvailable ? (
                  <>
                    Swap ETH, USDC and more from another chain into USDFC via{" "}
                    {/* `relative` lifts the link above the stretched button so it stays clickable. */}
                    <a
                      className='relative underline underline-offset-2'
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
                )}
              </span>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
