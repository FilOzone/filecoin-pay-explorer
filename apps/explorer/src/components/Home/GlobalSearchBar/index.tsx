"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SearchInput } from "@filecoin-foundation/ui-filecoin/SearchInput";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useNetwork from "@/hooks/useNetwork";
import type { ValidationError } from "./types";
import { classifyInput } from "./utils";

const GlobalSearchBar = () => {
  const [searchInput, setSearchInput] = useState("");
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const router = useRouter();
  const { network } = useNetwork();

  const handleSearch = () => {
    const classified = classifyInput(searchInput);

    switch (classified.kind) {
      case "empty":
        setValidationError(null);
        break;

      case "railId":
        setValidationError(null);
        router.push(`/${network}/rails/${classified.value}`);
        setSearchInput("");
        break;

      // TODO: Enable this case when account & operator detail pages are added.
      case "hexAddress":
        setValidationError({ message: "Account & operator search coming soon" });
        break;

      case "invalid":
        setValidationError({ message: "Enter a valid Rail ID (positive integer)" });
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
        <form onSubmit={handleSubmit} className='flex items-center gap-3'>
          <div className='flex-1'>
            <SearchInput
              value={searchInput}
              onChange={(value) => {
                setSearchInput(value);
                if (validationError) setValidationError(null);
              }}
              placeholder='Search by Rail ID'
            />
          </div>
          <Button type='submit' variant='primary' size='compact'>
            Search
          </Button>
        </form>

        {validationError && <p className='mt-2 text-sm text-red-600'>{validationError.message}</p>}
      </div>
    </PageSection>
  );
};

export default GlobalSearchBar;
