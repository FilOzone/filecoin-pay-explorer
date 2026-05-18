"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SearchInput } from "@filecoin-foundation/ui-filecoin/SearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@filecoin-pay/ui/components/popover";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LookupResult } from "@/hooks/useAddressLookup";
import { useAddressLookup } from "@/hooks/useAddressLookup";
import useNetwork from "@/hooks/useNetwork";
import { AddressLookupDropdown } from "./AddressLookupDropdown";
import type { ValidationError } from "./types";
import { classifyInput } from "./utils";

const GlobalSearchBar = () => {
  const [searchInput, setSearchInput] = useState("");
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const { network } = useNetwork();

  const classified = classifyInput(searchInput);
  const isHexInput = classified.kind === "hexAddress";

  const { results, isLoading } = useAddressLookup(isHexInput ? searchInput : "");

  const handleInputChange = (value: string) => {
    setSearchInput(value);
    if (validationError) setValidationError(null);
    setDropdownOpen(classifyInput(value).kind === "hexAddress");
  };

  const handleSearch = () => {
    switch (classified.kind) {
      case "empty":
        setValidationError(null);
        break;

      case "railId":
        setValidationError(null);
        router.push(`/${network}/rails/${classified.value}`);
        setSearchInput("");
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

  const handleResultSelect = (result: LookupResult) => {
    router.push(`/${network}/${result.type}s/${result.address}`);
    setDropdownOpen(false);
  };

  return (
    <PageSection backgroundVariant='light' paddingVariant='none'>
      <div className='pt-10 pb-5 w-full max-w-2xl'>
        <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <form onSubmit={handleSubmit} className='flex items-center gap-3'>
            <PopoverAnchor asChild>
              <div className='flex-1'>
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
