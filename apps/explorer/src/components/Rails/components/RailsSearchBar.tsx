import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { FilterButton } from "@filecoin-foundation/ui-filecoin/FilterButton";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { RefreshButton } from "@filecoin-foundation/ui-filecoin/RefreshButton";
import type { RailState } from "@filecoin-pay/types";
import { Popover, PopoverContent, PopoverTrigger } from "@filecoin-pay/ui/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { RAIL_STATES } from "@/constants/railStates";

export type SearchByOption = "railId" | "payer" | "payee" | "operator" | "state";

export type RailsSearchBarProps = {
  searchBy: SearchByOption;
  searchInput: string;
  selectedState: RailState | "";
  hasActiveFilters: boolean;
  isRefetching: boolean;
  onSearchByChange: (value: SearchByOption) => void;
  onSearchInputChange: (value: string) => void;
  onSelectedStateChange: (value: RailState) => void;
  onSearch: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function RailsSearchBar({
  searchBy,
  searchInput,
  selectedState,
  hasActiveFilters,
  isRefetching,
  onSearchByChange,
  onSearchInputChange,
  onSelectedStateChange,
  onSearch,
  onClear,
  onRefresh,
  onKeyDown,
}: RailsSearchBarProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const handleApplyFilters = () => {
    onSearch();
    setIsFiltersOpen(false);
  };

  const handleClearFilters = () => {
    onClear();
    setIsFiltersOpen(false);
  };

  return (
    <div className='flex md:items-center gap-6 md:justify-between md:flex-row flex-col'>
      {/* Search Input */}
      <div className='relative flex-1 max-w-[600px]'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        {searchBy === "state" ? (
          <Select value={selectedState} onValueChange={onSelectedStateChange}>
            <SelectTrigger className='pl-10'>
              <SelectValue placeholder='Search' />
            </SelectTrigger>
            <SelectContent>
              {RAIL_STATES.map((state) => (
                <SelectItem key={state.value} value={state.value}>
                  {state.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder='Search'
            value={searchInput}
            onChange={onSearchInputChange}
            onKeyDown={onKeyDown}
            className='pl-10'
          />
        )}
      </div>

      {/* Actions */}
      <div className='flex items-center gap-6 max-w-fit'>
        {/* Filters Button */}
        <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
          <PopoverTrigger asChild>
            <FilterButton Icon={FunnelSimpleIcon}>
              Filters
              {hasActiveFilters && (
                <span className='bg-primary text-xs text-primary-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-full min-w-5 h-5 grid place-content-center'>
                  1
                </span>
              )}
            </FilterButton>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-80'>
            <div className='space-y-4'>
              <div className='space-y-2'>
                <h4 className='font-medium text-sm'>Search By</h4>
                <Select value={searchBy} onValueChange={onSearchByChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='railId'>Rail ID</SelectItem>
                    <SelectItem value='payer'>Payer Address</SelectItem>
                    <SelectItem value='payee'>Payee Address</SelectItem>
                    <SelectItem value='operator'>Operator Address</SelectItem>
                    <SelectItem value='state'>State</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='flex gap-6 justify-center pt-2'>
                <Button variant='primary' onClick={handleApplyFilters} size='compact'>
                  Apply
                </Button>
                {hasActiveFilters && (
                  <Button variant='tertiary' onClick={handleClearFilters} size='compact'>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <RefreshButton onClick={onRefresh} disabled={isRefetching} />
      </div>
    </div>
  );
}

export default RailsSearchBar;
