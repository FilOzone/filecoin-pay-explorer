"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SearchInput } from "@filecoin-foundation/ui-filecoin/SearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@filecoin-pay/ui/components/popover";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { LookupResult } from "@/hooks/useAddressLookup";
import { useAddressLookup } from "@/hooks/useAddressLookup";
import useNetwork from "@/hooks/useNetwork";
import { formatHexForSearch } from "@/utils/hexUtils";
import { AddressLookupDropdown } from "./AddressLookupDropdown";
import type { ValidationError } from "./types";
import { classifyInput } from "./utils";

const GlobalSearchBar = () => {
  const [searchInput, setSearchInput] = useState("");
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { network } = useNetwork();

  const classified = classifyInput(searchInput);
  const isHexInput = classified.kind === "hexAddress";
  // Only look up once there is at least one whole byte to match on.
  const canLookup = isHexInput && formatHexForSearch(searchInput) !== null;

  const { results, isLoading } = useAddressLookup(canLookup ? searchInput : "");

  const handleResultSelect = useCallback(
    (result: LookupResult) => {
      router.push(`/${network}/${result.type}s/${result.address}`);
      setDropdownOpen(false);
      setSearchInput("");
    },
    [router, network],
  );

  // Defer submit to lookup result rather than navigating to hardcoded path (account vs operator)
  const resolveAddressSubmit = useCallback(() => {
    if (isLoading) {
      // Results are still debouncing/pending, don't act on stale matches.
      setDropdownOpen(true);
      return;
    }

    if (results.length === 1) {
      handleResultSelect(results[0]);
    } else {
      // Keep dropdown open for zero ('Not Found') or multiple results.
      setDropdownOpen(true);
    }
  }, [isLoading, results, handleResultSelect]);

  const handleInputChange = (value: string) => {
    setSearchInput(value);
    if (validationError) setValidationError(null);
    setDropdownOpen(classifyInput(value).kind === "hexAddress");
  };

  const handleSearch = () => {
    setValidationError(null);

    switch (classified.kind) {
      case "empty":
        break;

      case "railId":
        router.push(`/${network}/rails/${classified.value}`);
        setSearchInput("");
        break;

      case "hexAddress":
        resolveAddressSubmit();
        break;

      case "invalid":
        setValidationError({ message: "Enter a valid Rail ID or address (0x...)" });
        break;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <PageSection backgroundVariant='light' paddingVariant='none'>
      <div className='pt-10 pb-5 w-full max-w-2xl'>
        {/* `canLookup` gates visibility on valid input (hex address with at least one byte) */}
        <Popover open={dropdownOpen && canLookup} onOpenChange={setDropdownOpen}>
          <form ref={formRef} onSubmit={handleSubmit} className='flex items-center gap-3'>
            <PopoverAnchor asChild>
              {/* Reopen the dropdown once SearchInput regains focus. */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: focus is observed on the wrapper because SearchInput exposes no onFocus. */}
              <div className='flex-1' onFocus={() => isHexInput && setDropdownOpen(true)}>
                <SearchInput
                  value={searchInput}
                  onChange={handleInputChange}
                  placeholder='Search by Rail ID or address (0x...)'
                />
              </div>
            </PopoverAnchor>
            <Button type='submit' variant='primary' size='compact'>
              Search
            </Button>
          </form>

          <PopoverContent
            align='start'
            sideOffset={8}
            className='w-[var(--radix-popover-trigger-width)] max-h-72 overflow-y-auto p-0'
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Keep the dropdown open when the interaction lands on the form
              const target = e.detail.originalEvent.target as Node | null;
              if (target && formRef.current?.contains(target)) e.preventDefault();
            }}
          >
            <AddressLookupDropdown results={results} isLoading={isLoading} onSelect={handleResultSelect} />
          </PopoverContent>
        </Popover>

        {validationError && <p className='mt-2 text-sm text-red-600'>{validationError.message}</p>}
      </div>
    </PageSection>
  );
};

export default GlobalSearchBar;
