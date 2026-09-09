import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import ExplorerLink from "@/components/shared/ExplorerLink";
import TokenIcon from "@/components/shared/TokenIcon";
import { formatAddress } from "@/utils/formatter";
import { CUSTOM_OPTION, type TokenSelection } from "../hooks";

export interface PaymentTokenSelectorProps {
  selection: TokenSelection;
  explorerUrl?: string;
  /** Clears amounts that were entered for the previous token. */
  onTokenChanged: () => void;
}

export const PaymentTokenSelector: React.FC<PaymentTokenSelectorProps> = ({
  selection,
  explorerUrl,
  onTokenChanged,
}) => {
  const { token, customTokenState } = selection;

  return (
    <div className='grid gap-3'>
      <Label htmlFor='paymentToken'>Payment in</Label>
      <Select
        value={selection.tokenChoice}
        onValueChange={(value) => {
          selection.chooseToken(value);
          onTokenChanged();
        }}
      >
        <SelectTrigger id='paymentToken' className='w-full'>
          <SelectValue placeholder='Choose a token…' />
        </SelectTrigger>
        <SelectContent>
          {selection.knownTokens.map((knownToken) => (
            <SelectItem key={knownToken.address} value={knownToken.address}>
              <span className='flex items-center gap-2'>
                <TokenIcon token={knownToken} className='size-5' />
                <span>{knownToken.symbol}</span>
                <span className='font-mono text-xs text-muted-foreground'>({formatAddress(knownToken.address)})</span>
              </span>
            </SelectItem>
          ))}
          {selection.knownTokens.length > 0 && <SelectSeparator />}
          <SelectItem value={CUSTOM_OPTION}>Custom token address…</SelectItem>
        </SelectContent>
      </Select>

      {selection.tokenChoice === CUSTOM_OPTION && (
        <Input
          id='customToken'
          placeholder='Token contract address 0x…'
          value={selection.customTokenInput}
          onChange={(value) => {
            selection.enterCustomTokenAddress(value);
            onTokenChanged();
          }}
        />
      )}
      {customTokenState === "invalid" && (
        <div className='flex items-center gap-2 text-sm text-destructive'>
          <AlertCircle className='h-4 w-4' />
          <span>Invalid token address</span>
        </div>
      )}
      {customTokenState === "loading" && (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />
          <span>Loading token details…</span>
        </div>
      )}
      {customTokenState === "error" && (
        <div className='flex items-center gap-2 text-sm text-destructive'>
          <AlertCircle className='h-4 w-4' />
          <span>Couldn't read this token. Check it is an ERC-20 contract on the connected network.</span>
        </div>
      )}
      {customTokenState === "loaded" && token && (
        <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
          <CheckCircle2 className='h-4 w-4' />
          <span>
            {token.symbol} · {token.decimals} decimals
          </span>
        </div>
      )}

      {token && (
        <div className='flex items-center gap-1 text-xs text-muted-foreground'>
          <span>Token contract:</span>
          <ExplorerLink address={token.address} explorerUrl={explorerUrl} pinned label='Token contract address' />
        </div>
      )}
    </div>
  );
};
