import type { Account } from "@filecoin-pay/types";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { Input } from "@filecoin-pay/ui/components/input";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useInfiniteAccounts, { type AccountsFilter } from "@/hooks/useInfiniteAccounts";
import { formatAddress, formatCompactNumber } from "@/utils/formatter";
import { formatHexForSearch } from "@/utils/hexUtils";

const Accounts = () => {
  const [searchInput, setSearchInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AccountsFilter>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } =
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

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <ErrorState refetch={refetch} error={error} />;
  }

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        {/* Header */}
        <div className='flex flex-col gap-2'>
          <h1 className='text-3xl font-bold'>Accounts</h1>
          <p className='text-muted-foreground'>Browse all accounts on the network</p>
        </div>

        {/* Search Bar */}
        <Card className='p-4'>
          <div className='flex gap-2'>
            <Input
              placeholder='Search by address (0x...)...'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className='flex-1'
            />
            <Button onClick={handleSearch} size='default'>
              <Search className='h-4 w-4 mr-2' />
              Search
            </Button>
            {hasActiveFilters && (
              <Button onClick={handleClearFilters} variant='outline' size='default'>
                Clear
              </Button>
            )}
          </div>
        </Card>

        {/* Results */}
        {allAccounts.length === 0 && !hasActiveFilters ? (
          <EmptyStateInitial />
        ) : allAccounts.length === 0 && hasActiveFilters ? (
          <EmptyStateNoResults onClear={handleClearFilters} />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead className='text-right'>Total Rails</TableHead>
                  <TableHead className='text-right'>Total Tokens</TableHead>
                  <TableHead className='text-right'>Total Approvals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allAccounts.map((account: Account) => (
                  <TableRow key={account.id}>
                    <TableCell className='font-mono text-sm'>
                      <Link to={`/account/${account.address}`} className='text-primary hover:underline'>
                        {formatAddress(account.address)}
                      </Link>
                    </TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(account.totalRails)}</TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(account.totalTokens)}</TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(account.totalApprovals)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Infinite scroll trigger */}
            <div ref={observerTarget} className='h-20 flex items-center justify-center'>
              {isFetchingNextPage && (
                <div className='flex items-center gap-2 text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span className='text-sm'>Loading more accounts...</span>
                </div>
              )}
              {!hasNextPage && allAccounts.length > 0 && (
                <p className='text-sm text-muted-foreground'>No more accounts to load</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
};

const LoadingState = () => (
  <main className='flex-1 px-3 sm:px-6 py-6'>
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <Skeleton className='h-9 w-40' />
        <Skeleton className='h-5 w-64' />
      </div>
      <Card className='p-4'>
        <Skeleton className='h-10 w-full' />
      </Card>
      <Card>
        <div className='p-4 space-y-4'>
          {[...Array(10)].map((_, i) => (
            <div key={i} className='flex gap-4 items-center justify-between'>
              <Skeleton className='h-4 w-32' />
              <div className='flex gap-8'>
                <Skeleton className='h-4 w-12' />
                <Skeleton className='h-4 w-12' />
                <Skeleton className='h-4 w-12' />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </main>
);

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <main className='flex-1 px-3 sm:px-6 py-6'>
    <div className='flex flex-col gap-6'>
      <h1 className='text-3xl font-bold'>Accounts</h1>
      <Card>
        <div className='py-16'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <AlertCircle />
              </EmptyMedia>
              <EmptyTitle>Failed to load accounts</EmptyTitle>
              <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={refetch}>Retry</Button>
            </EmptyContent>
          </Empty>
        </div>
      </Card>
    </div>
  </main>
);

const EmptyStateInitial = () => (
  <Card>
    <div className='py-16'>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No accounts found</EmptyTitle>
          <EmptyDescription>There are no accounts to display at the moment.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  </Card>
);

const EmptyStateNoResults: React.FC<{ onClear: () => void }> = ({ onClear }) => (
  <Card>
    <div className='py-16'>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No results found</EmptyTitle>
          <EmptyDescription>
            No account found with this address. Make sure the address is correct and try again.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onClear} variant='outline'>
            Clear Search
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  </Card>
);

export default Accounts;
