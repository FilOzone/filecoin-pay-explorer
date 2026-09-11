import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { describeServiceRailsFilter, isSearchable, toServiceRailsFilter } from "../rails-filter";

interface RailsSearchProps {
  appliedQuery: string;
  onSearch: (query: string) => void;
  onClear: () => void;
}

/**
 * The draft text and the applied filter are separate: typing does not search,
 * and the applied filter stays visible as a chip so the list is never narrowed
 * by something the reader cannot see or undo.
 */
export const RailsSearch: React.FC<RailsSearchProps> = ({ appliedQuery, onSearch, onClear }) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Exact matching means a partial value can only ever return nothing, so the
  // control stays disabled rather than reporting an empty result.
  const canSearch = isSearchable(searchQuery);
  const applied = appliedQuery ? describeServiceRailsFilter(toServiceRailsFilter(appliedQuery)) : undefined;

  const handleSearch = () => {
    if (!canSearch) {
      return;
    }

    onSearch(searchQuery.trim());
  };

  const handleClear = () => {
    setSearchQuery("");
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative flex-1'>
        <Input
          placeholder='Search by rail ID or payee address'
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={handleKeyDown}
          className='py-2 pr-10'
        />

        <button
          type='button'
          onClick={handleSearch}
          disabled={!canSearch}
          aria-label='Search rails by rail ID or payee address'
          className='absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:pointer-events-none disabled:opacity-50'
        >
          <Search className='size-5' />
        </button>
      </div>

      {applied ? (
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>Filtered by</span>
          <span className='flex items-center gap-2 rounded-full border py-1 pr-1 pl-3'>
            <span>
              {applied.label}: <span className='font-mono'>{applied.value}</span>
            </span>
            <button
              type='button'
              onClick={handleClear}
              aria-label={`Clear ${applied.label} filter`}
              className='cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400'
            >
              <X className='size-4' />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
};
