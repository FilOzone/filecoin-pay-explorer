"use client";
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
  OperatorsLoadingState,
  OperatorsSearchBar,
  OperatorsTable,
} from "./components";

const Operators = () => {
  const [searchInput, setSearchInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<OperatorsFilter>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } =
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

  if (isLoading) {
    return <OperatorsLoadingState />;
  }

  if (isError) {
    return <OperatorsErrorState error={error} onRetry={refetch} />;
  }

  return (
    <PageSection backgroundVariant='light' paddingVariant='medium'>
      <SectionContent title='Filecoin Pay Operators' description='Browse all operators on the network'>
        <div className='space-y-6'>
          <OperatorsSearchBar
            searchInput={searchInput}
            hasActiveFilters={hasActiveFilters}
            onSearchInputChange={setSearchInput}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
          />
          {allOperators.length === 0 && !hasActiveFilters ? (
            <OperatorsEmptyInitial />
          ) : allOperators.length === 0 && hasActiveFilters ? (
            <OperatorsEmptyNoResults onClear={handleClearFilters} />
          ) : (
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
