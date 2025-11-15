import { Button as NewButton } from "@filecoin-foundation/ui-filecoin/Button";
import { RefreshButton } from "@filecoin-foundation/ui-filecoin/RefreshButton";
import { Input } from "@filecoin-pay/ui/components/input";
import { Search } from "lucide-react";
import { BASE_DOMAIN } from "@/constants/site-metadata";

export type AccountsSearchBarProps = {
  searchInput: string;
  hasActiveFilters: boolean;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function AccountsSearchBar({
  searchInput,
  hasActiveFilters,
  onSearchInputChange,
  onClear,
  onRefresh,
  onKeyDown,
}: AccountsSearchBarProps) {
  return (
    <div className='flex items-center gap-3 justify-between'>
      {/* Search Input */}
      <div className='relative flex-1 max-w-[600px]'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search by address (0x...)'
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          className='pl-10'
        />
      </div>

      {/* Actions */}
      <div className='flex items-center gap-2'>
        {/* Clear Button */}
        {hasActiveFilters && (
          <NewButton baseDomain={BASE_DOMAIN} variant='ghost' onClick={onClear}>
            Clear
          </NewButton>
        )}

        {/* Refresh Button */}
        <RefreshButton baseDomain={BASE_DOMAIN} onClick={onRefresh} />
      </div>
    </div>
  );
}

export default AccountsSearchBar;
