import { Label } from "@filecoin-pay/ui/components/label";
import { Switch } from "@filecoin-pay/ui/components/switch";
import { useId } from "react";
import { formatUnits } from "viem";
import { FIL_GAS_TOP_UP_AMOUNT, type FilGasTopUp } from "../../data/squid-deposit-route";
import { formatTokenAmount, NATIVE_FRACTION_DIGITS } from "./wallets";

/**
 * Whether a slice of the arriving USDFC is sold for FIL so the account's
 * wallet can sign its first transactions. On by default for a wallet that
 * holds less FIL than the top-up brings; always the user's call.
 */
export function FilGasTopUpOption({
  checked,
  disabled,
  onCheckedChange,
  recipientFil,
  topUp,
}: {
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The account wallet's FIL, once read. */
  recipientFil: bigint | undefined;
  topUp: FilGasTopUp;
}) {
  const id = useId();
  const filAmount = formatUnits(FIL_GAS_TOP_UP_AMOUNT, 18);
  const holds = recipientFil === undefined ? undefined : formatTokenAmount(recipientFil, 18, NATIVE_FRACTION_DIGITS);
  const isLow = recipientFil !== undefined && recipientFil < FIL_GAS_TOP_UP_AMOUNT;
  const hint =
    holds === undefined
      ? "Sends a little FIL to your wallet so you can sign transactions on Filecoin."
      : isLow
        ? `Your wallet holds ${holds} FIL. A little FIL lets you sign your first transactions.`
        : `Your wallet already holds ${holds} FIL; turn this on to top it up.`;
  return (
    <div className='flex items-start justify-between gap-3 rounded-md border p-3'>
      <div className='grid gap-0.5'>
        <Label className='font-medium' htmlFor={id}>
          Keep about {filAmount} FIL for gas
        </Label>
        <span className='text-xs text-muted-foreground'>{hint}</span>
      </div>
      <div className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
        <span>−{formatTokenAmount(topUp.spendUsdfc, 18, 4)} USDFC</span>
        <Switch
          aria-label={`Keep about ${filAmount} FIL for gas`}
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  );
}
