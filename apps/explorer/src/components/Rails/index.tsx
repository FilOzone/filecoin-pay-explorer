"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import type { RailState } from "@filecoin-pay/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import type { RailsFilter } from "@/hooks/useInfiniteRails";
import useInfiniteRails from "@/hooks/useInfiniteRails";
import { RailsEmptyInitial, RailsEmptyNoResults, RailsErrorState, RailsSearchBar, RailsTable } from "./components";
import type { SearchByOption } from "./components/RailsSearchBar";

const isPositiveInteger = (value: string) => /^[1-9]\d*$/.test(value);
const isNonNegativeInteger = (value: string) => /^(0|[1-9]\d*)$/.test(value);

const Rails = () => {
  const [searchBy, setSearchBy] = useState<SearchByOption>("railIdOrAddress");
  const [searchInput, setSearchInput] = useState("");
  const [selectedState, setSelectedState] = useState<RailState | "">("");
  const [appliedFilters, setAppliedFilters] = useState<RailsFilter>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, isRefetching, refetch } =
    useInfiniteRails(appliedFilters);

  const observerTarget = useRef<HTMLDivElement>(null);

  const allRails = useMemo(() => {
    return data?.pages.flatMap((page) => page.rails) || [];
  }, [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleSearch = () => {
    // State filters apply directly from the select via handleSelectedStateChange.
    if (searchBy === "state") {
      return;
    }

    const newFilters: RailsFilter = {};
    const trimmedInput = searchInput.trim();

    if (!trimmedInput) {
      setValidationError("Enter a value to search.");
      return;
    }

    switch (searchBy) {
      case "railIdOrAddress": {
        if (isPositiveInteger(trimmedInput)) {
          newFilters.railId = trimmedInput;
        } else if (isAddress(trimmedInput, { strict: false })) {
          newFilters.address = trimmedInput.toLowerCase();
        } else {
          setValidationError("Enter a Rail ID greater than 0 or a valid address (0x...).");
          return;
        }
        break;
      }
      case "railId": {
        if (!isPositiveInteger(trimmedInput)) {
          setValidationError("Enter a Rail ID greater than 0.");
          return;
        }
        newFilters.railId = trimmedInput;
        break;
      }
      case "payer": {
        if (!isAddress(trimmedInput, { strict: false })) {
          setValidationError("Enter a valid payer address (0x...).");
          return;
        }
        newFilters.payer = trimmedInput.toLowerCase();
        break;
      }
      case "payee": {
        if (!isAddress(trimmedInput, { strict: false })) {
          setValidationError("Enter a valid payee address (0x...).");
          return;
        }
        newFilters.payee = trimmedInput.toLowerCase();
        break;
      }
      case "operator": {
        if (!isAddress(trimmedInput, { strict: false })) {
          setValidationError("Enter a valid operator address (0x...).");
          return;
        }
        newFilters.operator = trimmedInput.toLowerCase();
        break;
      }
      case "totalSettlements": {
        if (!isNonNegativeInteger(trimmedInput)) {
          setValidationError("Enter a non-negative number of settlements.");
          return;
        }
        newFilters.totalSettlements = trimmedInput;
        break;
      }
      case "totalRateChanges": {
        if (!isNonNegativeInteger(trimmedInput)) {
          setValidationError("Enter a non-negative number of rate changes.");
          return;
        }
        newFilters.totalRateChanges = trimmedInput;
        break;
      }
    }

    setValidationError(null);
    setAppliedFilters(newFilters);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedState("");
    setAppliedFilters({});
    setValidationError(null);
  };

  const handleSearchByValueChange = (value: SearchByOption) => {
    setSearchBy(value);
    setAppliedFilters({});
    setValidationError(null);

    if (value === "state") {
      setSearchInput("");
    } else {
      setSelectedState("");
    }
  };

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    setValidationError(null);
  };

  const handleSelectedStateChange = (value: RailState) => {
    setSelectedState(value);
    setValidationError(null);
    setAppliedFilters({ state: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  return (
    <PageSection backgroundVariant='light'>
      <SectionContent headingTag='h1' title='Filecoin Pay Rails' description='Browse all payment rails on the network'>
        <div className='space-y-6'>
          <RailsSearchBar
            searchBy={searchBy}
            searchInput={searchInput}
            selectedState={selectedState}
            hasActiveFilters={hasActiveFilters}
            isRefetching={isRefetching}
            onSearchByChange={handleSearchByValueChange}
            onSearchInputChange={handleSearchInputChange}
            onSelectedStateChange={handleSelectedStateChange}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
            validationError={validationError}
          />

          {isLoading && <LoadingStateCard message='Loading Rails...' />}

          {isError && <RailsErrorState error={error} onRetry={refetch} />}

          {!isError && !isLoading && allRails.length === 0 && !hasActiveFilters && <RailsEmptyInitial />}

          {!isError && !isLoading && allRails.length === 0 && hasActiveFilters && (
            <RailsEmptyNoResults onClear={handleClearFilters} />
          )}

          {!isError && !isLoading && allRails.length > 0 && (
            <RailsTable
              data={allRails}
              observerTarget={observerTarget}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage}
            />
          )}
        </div>
      </SectionContent>
    </PageSection>
  );
};

export default Rails;
