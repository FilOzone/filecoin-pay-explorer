import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { RefreshButton } from "@filecoin-foundation/ui-filecoin/RefreshButton";
import type { RailState } from "@filecoin-pay/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { Search } from "lucide-react";
import { RAIL_STATES } from "@/constants/railStates";

export type SearchByOption =
  | "railIdOrAddress"
  | "railId"
  | "payer"
  | "payee"
  | "operator"
  | "totalSettlements"
  | "totalRateChanges"
  | "state";

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
  validationError: string | null;
};

const SEARCH_PLACEHOLDERS: Record<Exclude<SearchByOption, "state">, string> = {
  railIdOrAddress: "Search by Rail ID or address (0x...)",
  railId: "Search by Rail ID (e.g., 123)",
  payer: "Search by payer address (0x...)",
  payee: "Search by payee address (0x...)",
  operator: "Search by operator address (0x...)",
  totalSettlements: "Minimum number of settlements",
  totalRateChanges: "Minimum number of rate changes",
};

const SEARCH_BY_LABELS: Record<SearchByOption, string> = {
  railIdOrAddress: "Rail ID or Address",
  railId: "Rail ID",
  payer: "Payer Address",
  payee: "Payee Address",
  operator: "Operator Address",
  totalSettlements: "Settlements",
  totalRateChanges: "Rate Changes",
  state: "State",
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
  validationError,
}: RailsSearchBarProps) {
  const isStateSearch = searchBy === "state";
  const searchPlaceholder = isStateSearch ? "Select rail state" : SEARCH_PLACEHOLDERS[searchBy];

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-1 flex-col gap-3 sm:flex-row'>
          <Select value={searchBy} onValueChange={onSearchByChange}>
            <SelectTrigger aria-label='Search rails by' className='w-full data-[size=default]:h-[50px] sm:w-[220px]'>
              <SelectValue>{SEARCH_BY_LABELS[searchBy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='railIdOrAddress'>Rail ID or Address</SelectItem>
              <SelectItem value='railId'>Rail ID</SelectItem>
              <SelectItem value='payer'>Payer Address</SelectItem>
              <SelectItem value='payee'>Payee Address</SelectItem>
              <SelectItem value='operator'>Operator Address</SelectItem>
              <SelectItem value='totalSettlements'>Settlements</SelectItem>
              <SelectItem value='totalRateChanges'>Rate Changes</SelectItem>
              <SelectItem value='state'>State</SelectItem>
            </SelectContent>
          </Select>

          <div className='relative min-w-0 flex-1'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            {isStateSearch ? (
              <Select value={selectedState} onValueChange={onSelectedStateChange}>
                <SelectTrigger aria-label={searchPlaceholder} className='w-full pl-10 data-[size=default]:h-[50px]'>
                  <SelectValue placeholder={searchPlaceholder} />
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
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={searchInput}
                onChange={onSearchInputChange}
                onKeyDown={onKeyDown}
                className='pl-10'
              />
            )}
          </div>

          {!isStateSearch && (
            <Button variant='primary' onClick={onSearch} disabled={!searchInput.trim()} size='compact'>
              Search
            </Button>
          )}

          {hasActiveFilters && (
            <Button variant='tertiary' onClick={onClear} size='compact'>
              Clear
            </Button>
          )}
        </div>

        <RefreshButton onClick={onRefresh} disabled={isRefetching} />
      </div>

      {validationError && <p className='text-sm text-destructive'>{validationError}</p>}
    </div>
  );
}

export default RailsSearchBar;
