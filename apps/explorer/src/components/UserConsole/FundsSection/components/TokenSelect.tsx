import type { UserToken } from "@filecoin-pay/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import TokenIcon from "@/components/shared/TokenIcon";

type TokenSelectProps = {
  tokens: UserToken[];
  selectedToken: UserToken;
  onSelect: (tokenId: string) => void;
};

/** Picks which token the overview cards, Deposit and Withdraw all act on. */
const TokenSelect = ({ tokens, selectedToken, onSelect }: TokenSelectProps) => (
  <Select value={selectedToken.id} onValueChange={onSelect}>
    <SelectTrigger size='sm' aria-label='Selected token' className='rounded-full border-0 shadow-none'>
      <SelectValue>
        <TokenIcon token={selectedToken.token} />
        <span className='font-medium'>{selectedToken.token.symbol}</span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {tokens.map((userToken) => (
        <SelectItem key={userToken.id} value={userToken.id}>
          <TokenIcon token={userToken.token} />
          <span>{userToken.token.symbol}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default TokenSelect;
