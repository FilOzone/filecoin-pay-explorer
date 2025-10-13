import { Button } from "@filecoin-pay/ui/components/button";
import { Input } from "@filecoin-pay/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { Search, X } from "lucide-react";
import { useState } from "react";

export type SearchFilterType = "railId" | "operator" | "payer" | "payee";

interface RailsSearchProps {
  onSearch: (query: string, filterType: SearchFilterType) => void;
  onClear: () => void;
}

export const RailsSearch: React.FC<RailsSearchProps> = ({ onSearch, onClear }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<SearchFilterType>("railId");
  const [isActive, setIsActive] = useState(false);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setIsActive(true);
      onSearch(searchQuery.trim(), filterType);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setFilterType("railId");
    setIsActive(false);
    onClear();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getPlaceholder = () => {
    switch (filterType) {
      case "railId":
        return "Search by Rail ID (e.g., 123)";
      case "operator":
        return "Search by Operator Address (0x...)";
      case "payer":
        return "Search by Payer Address (0x...)";
      case "payee":
        return "Search by Payee Address (0x...)";
      default:
        return "Search rails...";
    }
  };

  return (
    <div className='flex flex-col sm:flex-row gap-3'>
      {/* Filter Type Selector */}
      <Select value={filterType} onValueChange={(v: string) => setFilterType(v as SearchFilterType)}>
        <SelectTrigger className='w-full sm:w-[180px]'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='railId'>Rail ID</SelectItem>
          <SelectItem value='operator'>Operator</SelectItem>
          <SelectItem value='payer'>Payer</SelectItem>
          <SelectItem value='payee'>Payee</SelectItem>
        </SelectContent>
      </Select>

      {/* Search Input */}
      <div className='flex-1 flex gap-2'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder={getPlaceholder()}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className='pl-9'
          />
        </div>

        {/* Action Buttons */}
        <Button onClick={handleSearch} disabled={!searchQuery.trim()}>
          Search
        </Button>

        {isActive && (
          <Button variant='outline' onClick={handleClear} className='gap-2'>
            <X className='h-4 w-4' />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
