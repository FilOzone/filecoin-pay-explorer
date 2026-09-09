import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";

export interface SpendingLimitsFieldsProps {
  show: boolean;
  onToggleShow: () => void;
  isUnlimited: boolean;
  onIsUnlimitedChange: (value: boolean) => void;
  lockupAllowance: string;
  onLockupAllowanceChange: (value: string) => void;
  rateAllowance: string;
  onRateAllowanceChange: (value: string) => void;
  tokenSymbol: string | undefined;
}

export const SpendingLimitsFields: React.FC<SpendingLimitsFieldsProps> = ({
  show,
  onToggleShow,
  isUnlimited,
  onIsUnlimitedChange,
  lockupAllowance,
  onLockupAllowanceChange,
  rateAllowance,
  onRateAllowanceChange,
  tokenSymbol,
}) => (
  <div className='grid gap-3'>
    <button type='button' onClick={onToggleShow} className='text-sm text-primary text-left w-fit hover:underline'>
      {show ? "Hide spending limits" : "Set spending limits (optional)"}
    </button>
    {show && (
      <div className='grid gap-3 rounded-lg border p-3'>
        <label className='flex items-center gap-2 text-sm cursor-pointer'>
          <input
            type='checkbox'
            checked={isUnlimited}
            onChange={(e) => onIsUnlimitedChange(e.target.checked)}
            className='rounded'
          />
          No spending limit (default)
        </label>
        <div className='grid grid-cols-2 gap-3'>
          <div className='grid gap-2'>
            <Label htmlFor='lockupAllowance' className='text-xs text-muted-foreground'>
              Reserve limit{tokenSymbol ? ` (${tokenSymbol})` : ""}
            </Label>
            <Input
              id='lockupAllowance'
              type='number'
              placeholder='0.0'
              value={lockupAllowance}
              onChange={onLockupAllowanceChange}
              min='0'
              disabled={isUnlimited}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='rateAllowance' className='text-xs text-muted-foreground'>
              Rate limit{tokenSymbol ? ` (${tokenSymbol} per epoch)` : ""}
            </Label>
            <Input
              id='rateAllowance'
              type='number'
              placeholder='0.0'
              value={rateAllowance}
              onChange={onRateAllowanceChange}
              min='0'
              disabled={isUnlimited}
            />
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>
          Advanced. Limits cap how much the service can reserve and charge; most users keep this unlimited and rely on
          removing the service instead.
        </p>
      </div>
    )}
  </div>
);
