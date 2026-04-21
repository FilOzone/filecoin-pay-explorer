import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { RefreshButton } from "@filecoin-foundation/ui-filecoin/RefreshButton";
import { Search } from "lucide-react";

export type OperatorsSearchBarProps = {
  searchInput: string;
  hasActiveFilters: boolean;
  isRefetching: boolean;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function OperatorsSearchBar({
  searchInput,
  hasActiveFilters,
  isRefetching,
  onSearchInputChange,
  onClear,
  onRefresh,
  onKeyDown,
}: OperatorsSearchBarProps) {
  return (
    <div className='flex md:items-center gap-6 flex-col md:flex-row md:justify-between'>
      {/* Search Input */}
      <div className='relative flex-1 max-w-[600px]'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search by address (0x...)'
          value={searchInput}
          onChange={onSearchInputChange}
          onKeyDown={onKeyDown}
          className='pl-10'
        />
      </div>

      {/* Actions */}
      <div className='flex items-center gap-6'>
        {/* Clear Button */}
        {hasActiveFilters && (
          <Button variant='tertiary' onClick={onClear} size='compact'>
            Clear
          </Button>
        )}

        {/* Refresh Button */}
        <RefreshButton disabled={isRefetching} onClick={onRefresh} />
      </div>
    </div>
  );
}

export default OperatorsSearchBar;
