"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountsFilter } from "@/hooks/useInfiniteAccounts";
import useInfiniteAccounts from "@/hooks/useInfiniteAccounts";
import { formatHexForSearch } from "@/utils/hexUtils";
import {
  AccountsEmptyInitial,
  AccountsEmptyNoResults,
  AccountsErrorState,
  AccountsSearchBar,
  AccountsTable,
} from "./components";

const Accounts = () => {
  const [searchInput, setSearchInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AccountsFilter>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, isRefetching, refetch } =
    useInfiniteAccounts(appliedFilters);

  const observerTarget = useRef<HTMLDivElement>(null);

  const allAccounts = useMemo(() => {
    return data?.pages.flatMap((page) => page.accounts) || [];
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
    <PageSection backgroundVariant='light'>
      <SectionContent headingTag='h1' title='Filecoin Pay Accounts' description='Browse all accounts on the network'>
        <div className='space-y-6'>
          <AccountsSearchBar
            searchInput={searchInput}
            hasActiveFilters={hasActiveFilters}
            isRefetching={isRefetching}
            onSearchInputChange={setSearchInput}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
          />

          {isLoading && <LoadingStateCard message='Loading Accounts...' />}

          {isError && <AccountsErrorState error={error} onRetry={refetch} />}

          {!isError && !isLoading && allAccounts.length === 0 && !hasActiveFilters && <AccountsEmptyInitial />}

          {!isError && !isLoading && allAccounts.length === 0 && hasActiveFilters && (
            <AccountsEmptyNoResults onClear={handleClearFilters} />
          )}

          {!isError && !isLoading && allAccounts.length > 0 && (
            <AccountsTable
              data={allAccounts}
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

export default Accounts;
