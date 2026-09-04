import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface RailsSearchProps {
  onSearch: (railId: string) => void;
  onClear: () => void;
}

/**
 * Rail ID is the only useful filter on the service page: the payer, the payee's
 * counterparty column, and the operator are all fixed by the route.
 */
export const RailsSearch: React.FC<RailsSearchProps> = ({ onSearch, onClear }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isActive, setIsActive] = useState(false);

  const handleSearch = () => {
    const railId = searchQuery.trim();
    if (!railId) {
      return;
    }

    setIsActive(true);
    onSearch(railId);
  };

  const handleClear = () => {
    setSearchQuery("");
    setIsActive(false);
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className='flex flex-1 items-center gap-2'>
      <div className='relative flex-1'>
        {/* `py-2` and `pr-10` land after the Input's own `p-3`, so they win:
            Tailwind orders `p-*` before the axis and side utilities. */}
        <Input
          placeholder='Search by Rail ID (e.g., 123)'
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={handleKeyDown}
          className='py-2 pr-10'
        />

        {/* The icon is the submit control, so it carries a label of its own —
            there is no visible button text to name it. */}
        <button
          type='button'
          onClick={handleSearch}
          disabled={!searchQuery.trim()}
          aria-label='Search rails by ID'
          className='absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:pointer-events-none disabled:opacity-50'
        >
          <Search className='size-4' />
        </button>
      </div>

      {isActive && (
        <Button variant='tertiary' onClick={handleClear} className='gap-2' size='compact'>
          <X className='h-4 w-4' />
          Clear
        </Button>
      )}
    </div>
  );
};
