import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { AlertCircle } from "lucide-react";
import { formatTokenAmount, NATIVE_FRACTION_DIGITS } from "./wallets";

/**
 * Offers to put USDC into the paying wallet through Privy's card onramp or
 * transfer picker, on a network of the user's choosing among those the onramp
 * delivers to and Squid can pay from.
 */
export function TopUpWalletPanel({
  chainId,
  chains,
  hasPrivyLogin,
  isBusy,
  message,
  onBuyWithCard,
  onChainChange,
  onLogin,
  onTransfer,
  tone,
}: {
  chainId: number;
  chains: readonly { id: number; name: string }[];
  hasPrivyLogin: boolean;
  isBusy: boolean;
  message: string;
  onBuyWithCard: () => void;
  onChainChange: (chainId: number) => void;
  onLogin: () => void;
  onTransfer: () => void;
  tone: "muted" | "destructive";
}) {
  return (
    <div className='grid gap-3 rounded-md border p-3'>
      <span
        className={tone === "destructive" ? "text-destructive" : "text-muted-foreground"}
        role={tone === "destructive" ? "alert" : undefined}
      >
        {message}
      </span>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='flex items-center gap-2'>
          <Label className='text-muted-foreground' htmlFor='fund-with-usdc-card-chain'>
            Add USDC on
          </Label>
          <Select disabled={isBusy} onValueChange={(value) => onChainChange(Number(value))} value={String(chainId)}>
            <SelectTrigger aria-label='Network to add USDC on' id='fund-with-usdc-card-chain' size='sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chains.map((chain) => (
                <SelectItem key={chain.id} value={String(chain.id)}>
                  {chain.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <span className='flex flex-wrap gap-2'>
          <Button
            aria-label={hasPrivyLogin ? "Buy USDC with card" : "Log in to buy with card"}
            disabled={isBusy}
            onClick={hasPrivyLogin ? onBuyWithCard : onLogin}
            size='compact'
            type='button'
            variant='primary'
          >
            {hasPrivyLogin ? "Buy with card" : "Log in to buy with card"}
          </Button>
          {hasPrivyLogin && (
            <Button
              aria-label='Add USDC with Privy'
              disabled={isBusy}
              onClick={onTransfer}
              size='compact'
              type='button'
              variant='tertiary'
            >
              Transfer
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

/** The paying wallet lacks gas for the approval and the swap. */
export function GasShortfallPanel({
  gasTopUpAmount,
  hasPrivyLogin,
  isBusy,
  nativeSymbol,
  networkName,
  onAddGas,
  onLogin,
  requiredNative,
}: {
  gasTopUpAmount: string;
  hasPrivyLogin: boolean;
  isBusy: boolean;
  nativeSymbol: string;
  networkName: string;
  onAddGas: () => void;
  onLogin: () => void;
  requiredNative: bigint;
}) {
  const required = formatTokenAmount(requiredNative, 18, NATIVE_FRACTION_DIGITS);
  const needed = required === "0" ? `less than ${1 / 10 ** NATIVE_FRACTION_DIGITS}` : `about ${required}`;
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3'>
      <span className='inline-flex items-start gap-2'>
        <AlertCircle aria-hidden className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
        <span>
          Needs {needed} {nativeSymbol} on {networkName} for gas and fees.
        </span>
      </span>
      <Button
        aria-label={hasPrivyLogin ? "Add gas with Privy" : "Log in to add gas"}
        disabled={isBusy}
        onClick={hasPrivyLogin ? onAddGas : onLogin}
        size='compact'
        type='button'
        variant='tertiary'
      >
        {hasPrivyLogin ? `Add ${gasTopUpAmount} ${nativeSymbol}` : "Log in to add gas"}
      </Button>
    </div>
  );
}
