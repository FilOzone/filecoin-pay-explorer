"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OperatorsFilter } from "@/hooks/useInfiniteOperators";
import useInfiniteOperators from "@/hooks/useInfiniteOperators";
import { formatHexForSearch } from "@/utils/hexUtils";
import {
  OperatorsEmptyInitial,
  OperatorsEmptyNoResults,
  OperatorsErrorState,
  OperatorsSearchBar,
  OperatorsTable,
} from "./components";

const Operators = () => {
  const [searchInput, setSearchInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<OperatorsFilter>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, isRefetching, refetch } =
    useInfiniteOperators(appliedFilters);

  const observerTarget = useRef<HTMLDivElement>(null);

  const allOperators = useMemo(() => {
    return data?.pages.flatMap((page) => page.operators) || [];
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
    const trimmedInput = searchInput.trim();
    if (!trimmedInput) {
      setAppliedFilters({});
      return;
    }

    const formattedHex = formatHexForSearch(trimmedInput);
    if (formattedHex) {
      setAppliedFilters({ address: formattedHex });
    }
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setAppliedFilters({});
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  return (
    <PageSection backgroundVariant='light' paddingVariant='default'>
      <SectionContent headingTag='h1' title='Filecoin Pay Operators' description='Browse all operators on the network'>
        <div className='space-y-6'>
          <OperatorsSearchBar
            searchInput={searchInput}
            hasActiveFilters={hasActiveFilters}
            isRefetching={isRefetching}
            onSearchInputChange={setSearchInput}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
          />

          {isLoading && <LoadingStateCard message='Loading Operators...' />}

          {isError && <OperatorsErrorState error={error} onRetry={refetch} />}

          {!isError && !isLoading && allOperators.length === 0 && !hasActiveFilters && <OperatorsEmptyInitial />}

          {!isError && !isLoading && allOperators.length === 0 && hasActiveFilters && (
            <OperatorsEmptyNoResults onClear={handleClearFilters} />
          )}

          {!isError && !isLoading && allOperators.length > 0 && (
            <OperatorsTable
              data={allOperators}
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

export default Operators;
