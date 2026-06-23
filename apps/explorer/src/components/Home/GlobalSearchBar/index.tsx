"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SearchInput } from "@filecoin-foundation/ui-filecoin/SearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@filecoin-pay/ui/components/popover";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAddressLookup } from "@/hooks/useAddressLookup";
import useNetwork from "@/hooks/useNetwork";
import { formatHexForSearch } from "@/utils/hexUtils";
import { SearchResultsDropdown } from "./SearchResultsDropdown";
import type { SearchOption } from "./types";
import { classifyInput } from "./utils";

const GlobalSearchBar = () => {
  const [searchInput, setSearchInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { network } = useNetwork();

  const classified = classifyInput(searchInput);
  const isHexInput = classified.kind === "hexAddress";
  // Only look up once there is at least one whole byte to match on.
  const canLookup = isHexInput && formatHexForSearch(searchInput) !== null;

  const { results, isLoading } = useAddressLookup(canLookup ? searchInput : "");

  // Every input type resolves to dropdown options: a Rail ID becomes a single
  // "view rail" action, an address becomes its live account/operator matches.
  let options: SearchOption[] = [];
  if (classified.kind === "railId") {
    options = [{ kind: "rail", railId: classified.value }];
  } else if (canLookup) {
    options = results.map((result): SearchOption => ({ kind: "address", result }));
  }

  // Open the dropdown for any actionable input — a Rail ID or a lookup-able address.
  const showDropdown = classified.kind === "railId" || canLookup;
  // The Search button only commits a highlighted row, so it is enabled only when
  // there is one (not while empty, loading, or with no matches).
  const hasActiveOption = !isLoading && options.length > 0;
  // Surface the format hint live, as soon as the input can't be classified.
  const validationMessage = classified.kind === "invalid" ? classified.message : null;

  const goToOption = (option: SearchOption) => {
    if (option.kind === "rail") {
      router.push(`/${network}/rails/${option.railId}`);
    } else {
      router.push(`/${network}/${option.result.type}s/${option.result.address}`);
    }
    setDropdownOpen(false);
    setSearchInput("");
  };

  // Enter / click commit the highlighted option. Account vs operator is only
  // known from the lookup, so we never navigate to a hardcoded path.
  const commitActive = () => {
    if (isLoading || options.length === 0) {
      // Still debouncing/pending, or nothing to act on — keep the dropdown open.
      setDropdownOpen(showDropdown);
      return;
    }
    goToOption(options[activeIndex] ?? options[0]);
  };

  const handleInputChange = (value: string) => {
    setSearchInput(value);
    setActiveIndex(0);
    setDropdownOpen(classifyInput(value).kind !== "empty");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        commitActive();
        break;
      case "ArrowDown":
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        break;
      case "ArrowUp":
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Escape":
        setDropdownOpen(false);
        break;
    }
  };

  return (
    <PageSection backgroundVariant='light' paddingVariant='none'>
      <div className='pt-10 pb-5 w-full max-w-2xl'>
        <Popover open={dropdownOpen && showDropdown} onOpenChange={setDropdownOpen}>
          {/* Input + dropdown act as one combobox; the Search button mirrors the Enter key. */}
          <div ref={containerRef} className='flex items-center gap-3'>
            <PopoverAnchor asChild>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: SearchInput exposes no onFocus/onKeyDown handlers. */}
              <div
                className='flex-1'
                onFocus={() => setDropdownOpen(classified.kind !== "empty")}
                onKeyDown={handleKeyDown}
              >
                <SearchInput
                  value={searchInput}
                  onChange={handleInputChange}
                  placeholder='Search by Rail ID or address (0x...)'
                />
              </div>
            </PopoverAnchor>
            <Button type='button' variant='primary' size='compact' disabled={!hasActiveOption} onClick={commitActive}>
              Search
            </Button>
          </div>

          <PopoverContent
            align='start'
            sideOffset={8}
            className='w-[var(--radix-popover-trigger-width)] max-h-72 overflow-y-auto p-0'
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Keep the dropdown open when the interaction lands on the input
              const target = e.detail.originalEvent.target as Node | null;
              if (target && containerRef.current?.contains(target)) e.preventDefault();
            }}
          >
            <SearchResultsDropdown
              options={options}
              isLoading={isLoading}
              activeIndex={activeIndex}
              onSelect={goToOption}
              onHighlight={setActiveIndex}
            />
          </PopoverContent>
        </Popover>

        {validationMessage && <p className='mt-2 text-sm text-red-600'>{validationMessage}</p>}
      </div>
    </PageSection>
  );
};

export default GlobalSearchBar;
