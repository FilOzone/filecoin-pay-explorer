"use client";

import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { formatAddress } from "@/utils/formatter";

export type PayingAccountOption = {
  address: string;
  /** "This account", "Filecoin Pay wallet", or the wallet's name. */
  label: string;
  /** The selected token's balance, once known. */
  balance?: string;
};

const describe = (option: PayingAccountOption) => `${formatAddress(option.address)} · ${option.label}`;

export function PayingAccountField({
  disabled,
  onConnectWallet,
  onValueChange,
  options,
  value,
}: {
  disabled: boolean;
  onConnectWallet: () => void;
  onValueChange: (address: string) => void;
  options: readonly PayingAccountOption[];
  value: string;
}) {
  const [onlyOption] = options;
  const isChoice = options.length > 1;

  return (
    <div className='grid gap-1'>
      <Label htmlFor={isChoice ? "direct-squid-wallet" : undefined}>Paying wallet</Label>
      {isChoice ? (
        <Select disabled={disabled} onValueChange={onValueChange} value={value}>
          <SelectTrigger id='direct-squid-wallet' className='w-full'>
            <SelectValue placeholder='Select a wallet' />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.address} value={option.address}>
                {describe(option)}
                {option.balance ? ` · ${option.balance}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {!isChoice && onlyOption ? (
        <p className='rounded-md border px-3 py-2'>
          {describe(onlyOption)}
          {onlyOption.balance ? <span className='text-muted-foreground'> · {onlyOption.balance}</span> : null}
        </p>
      ) : null}
      <div className='flex flex-wrap gap-x-4 gap-y-1'>
        <button
          className='text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50'
          disabled={disabled}
          onClick={onConnectWallet}
          type='button'
        >
          + Connect another wallet
        </button>
      </div>
    </div>
  );
}
