import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import { formatUnits } from "viem";
import type { PaymentTokenDetails } from "../hooks";

export interface DepositAmountFieldProps {
  token: PaymentTokenDetails;
  amount: string;
  onAmountChange: (value: string) => void;
  balance: bigint | undefined;
  isLoadingBalance: boolean;
  isAmountEntered: boolean;
  isValidAmount: boolean;
  hasSufficientBalance: boolean;
}

export const DepositAmountField: React.FC<DepositAmountFieldProps> = ({
  token,
  amount,
  onAmountChange,
  balance,
  isLoadingBalance,
  isAmountEntered,
  isValidAmount,
  hasSufficientBalance,
}) => (
  <div className='grid gap-2'>
    <div className='flex items-center justify-between'>
      <Label htmlFor='amount'>Deposit amount</Label>
      {(balance !== undefined || isLoadingBalance) && (
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <Wallet className='h-3 w-3' />
          <span>
            Balance:{" "}
            {isLoadingBalance || balance === undefined ? (
              <Loader2 className='h-3 w-3 animate-spin inline' />
            ) : (
              <span className='font-medium text-foreground'>
                {Number(formatUnits(balance, token.decimals)).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{" "}
                {token.symbol}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
    <div className='relative'>
      <Input
        id='amount'
        type='number'
        placeholder='0.0'
        value={amount}
        onChange={onAmountChange}
        min='0'
        step='any'
        className='text-lg pr-16'
      />
      <Button
        type='button'
        variant='ghost'
        className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
        onClick={() => {
          if (balance !== undefined) onAmountChange(formatUnits(balance, token.decimals));
        }}
        disabled={balance === undefined || isLoadingBalance}
      >
        MAX
      </Button>
    </div>
    {isValidAmount && balance !== undefined && !hasSufficientBalance && (
      <p className='flex items-center gap-2 text-xs text-destructive'>
        <AlertCircle className='h-3.5 w-3.5 shrink-0' />
        Insufficient balance for this deposit.
      </p>
    )}
    {isAmountEntered && !isValidAmount && (
      <p className='flex items-center gap-2 text-xs text-destructive'>
        <AlertCircle className='h-3.5 w-3.5 shrink-0' />
        Enter a valid amount.
      </p>
    )}
    <p className='text-xs text-muted-foreground'>
      Funds stay in your account and the service bills them as you use it. Leave empty to add the service without
      depositing.
    </p>
  </div>
);
