import { Button as NewButton } from "@filecoin-foundation/ui-filecoin/Button";
import { RefreshButton } from "@filecoin-foundation/ui-filecoin/RefreshButton";
import type { RailState } from "@filecoin-pay/types";
import { Button } from "@filecoin-pay/ui/components/button";
import { Input } from "@filecoin-pay/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@filecoin-pay/ui/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { RAIL_STATES } from "@/constants/railStates";
import { BASE_DOMAIN } from "@/constants/site-metadata";

export type SearchByOption = "railId" | "payer" | "payee" | "operator" | "state";

export type RailsSearchBarProps = {
  searchBy: SearchByOption;
  searchInput: string;
  selectedState: RailState | "";
  hasActiveFilters: boolean;
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
    <div className='flex items-center gap-3 justify-between'>
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
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            className='pl-10'
          />
        )}
      </div>

      {/* Actions */}
      <div className='flex items-center gap-2'>
        {/* Filters Button */}
        <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant='outline' className='flex items-center gap-2 border-0'>
              <FunnelSimpleIcon size={20} />
              Filters
              {hasActiveFilters && (
                <span className='ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground'>
                  1
                </span>
              )}
            </Button>
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

              <div className='flex gap-2 pt-2'>
                <NewButton
                  baseDomain={BASE_DOMAIN}
                  variant='primary'
                  onClick={handleApplyFilters}
                  className='flex-1 py-2'
                >
                  Apply
                </NewButton>
                {hasActiveFilters && (
                  <NewButton baseDomain={BASE_DOMAIN} variant='ghost' onClick={handleClearFilters}>
                    Clear
                  </NewButton>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Refresh Button */}
        <RefreshButton baseDomain={BASE_DOMAIN} onClick={onRefresh} />
      </div>
    </div>
  );
}

export default RailsSearchBar;
