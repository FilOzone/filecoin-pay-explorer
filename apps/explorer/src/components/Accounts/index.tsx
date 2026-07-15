"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { getChain } from "@/constants/chains";
import type { AccountsFilter } from "@/hooks/useInfiniteAccounts";
import useInfiniteAccounts from "@/hooks/useInfiniteAccounts";
import useNetwork from "@/hooks/useNetwork";
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const { network } = useNetwork();
  const token = getChain(network).contracts.usdfc.address;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, isRefetching, refetch } =
    useInfiniteAccounts(appliedFilters, token);

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
      setValidationError("Enter a value to search.");
      return;
    }

    if (!isAddress(trimmedInput, { strict: false })) {
      setValidationError("Enter a valid & complete address (0x...).");
      return;
    }

    setValidationError(null);
    setAppliedFilters({ address: trimmedInput.toLowerCase() });
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setAppliedFilters({});
    setValidationError(null);
  };

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    setValidationError(null);
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
            onSearchInputChange={handleSearchInputChange}
            onSearch={handleSearch}
            onClear={handleClearFilters}
            onRefresh={refetch}
            onKeyDown={handleKeyDown}
            validationError={validationError}
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
