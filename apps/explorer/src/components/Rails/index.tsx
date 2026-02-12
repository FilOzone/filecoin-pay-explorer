"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import type { RailState } from "@filecoin-pay/types";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RailsFilter } from "@/hooks/useInfiniteRails";
import useInfiniteRails from "@/hooks/useInfiniteRails";
import { formatHexForSearch } from "@/utils/hexUtils";
import { RailsEmptyInitial, RailsEmptyNoResults, RailsErrorState, RailsSearchBar, RailsTable } from "./components";
import type { SearchByOption } from "./components/RailsSearchBar";

const Rails = () => {
  const [searchBy, setSearchBy] = useState<SearchByOption>("railId");
  const [searchInput, setSearchInput] = useState("");
  const [selectedState, setSelectedState] = useState<RailState | "">("");
  const [appliedFilters, setAppliedFilters] = useState<RailsFilter>({});

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
    const newFilters: RailsFilter = {};

    switch (searchBy) {
      case "railId": {
        const trimmedInput = searchInput.trim();
        if (!trimmedInput) {
          setAppliedFilters({});
          return;
        }
        newFilters.railId = trimmedInput;
        break;
      }
      case "payer": {
        const trimmedInput = searchInput.trim();
        if (!trimmedInput) {
          setAppliedFilters({});
          return;
        }
        const formattedHex = formatHexForSearch(trimmedInput);
        if (formattedHex) newFilters.payer = formattedHex;
        break;
      }
      case "payee": {
        const trimmedInput = searchInput.trim();
        if (!trimmedInput) {
          setAppliedFilters({});
          return;
        }
        const formattedHex = formatHexForSearch(trimmedInput);
        if (formattedHex) newFilters.payee = formattedHex;
        break;
      }
      case "operator": {
        const trimmedInput = searchInput.trim();
        if (!trimmedInput) {
          setAppliedFilters({});
          return;
        }
        const formattedHex = formatHexForSearch(trimmedInput);
        if (formattedHex) newFilters.operator = formattedHex;
        break;
      }
      case "state":
        if (!selectedState) {
          setAppliedFilters({});
          return;
        }
        newFilters.state = selectedState;
        break;
    }

    setAppliedFilters(newFilters);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedState("");
    setAppliedFilters({});
  };

  const handleSearchByValueChange = (value: SearchByOption) => {
    setSearchBy(value);
    setSearchInput("");
    setSelectedState("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  return (
    <PageSection backgroundVariant='light' paddingVariant='default'>
      <SectionContent headingTag='h1' title='Filecoin Pay Rails' description='Browse all payment rails on the network'>
        <div className='space-y-6'>
          <RailsSearchBar
            searchBy={searchBy}
            searchInput={searchInput}
            selectedState={selectedState}
            hasActiveFilters={hasActiveFilters}
            isRefetching={isRefetching}
            onSearchByChange={handleSearchByValueChange}
            onSearchInputChange={setSearchInput}
            onSelectedStateChange={(value) => setSelectedState(value as RailState)}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
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
