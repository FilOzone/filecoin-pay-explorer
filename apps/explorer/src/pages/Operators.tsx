import type { Operator } from "@filecoin-pay/types";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { AlertCircle, Info, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyableText } from "@/components/shared";
import useInfiniteOperators, { type OperatorsFilter } from "@/hooks/useInfiniteOperators";
import { formatCompactNumber } from "@/utils/formatter";
import { formatHexForSearch } from "@/utils/hexUtils";

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
          <h1 className='text-3xl font-bold'>Operators</h1>
          <p className='text-muted-foreground'>Browse all operators on the network</p>
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
        {allOperators.length === 0 && !hasActiveFilters ? (
          <EmptyStateInitial />
        ) : allOperators.length === 0 && hasActiveFilters ? (
          <EmptyStateNoResults onClear={handleClearFilters} />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead className='text-right'>Total Rails</TableHead>
                  <TableHead className='text-right'>Total Tokens</TableHead>
                  <TableHead className='text-right'>
                    <div className='flex items-center justify-end gap-1.5'>
                      Total Approvals
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
                        </TooltipTrigger>
                        <TooltipContent side='top' className='max-w-xs'>
                          How many accounts have given this payment manager permission to handle their payments
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOperators.map((operator: Operator) => (
                  <TableRow key={operator.id}>
                    <TableCell className='font-mono text-sm'>
                      <CopyableText
                        value={operator.address}
                        to={`/operator/${operator.address}`}
                        monospace={true}
                        label='Account'
                        truncate={true}
                        truncateLength={8}
                      />
                    </TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(operator.totalRails)}</TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(operator.totalTokens)}</TableCell>
                    <TableCell className='text-right'>{formatCompactNumber(operator.totalApprovals)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Infinite scroll trigger */}
            <div ref={observerTarget} className='h-20 flex items-center justify-center'>
              {isFetchingNextPage && (
                <div className='flex items-center gap-2 text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span className='text-sm'>Loading more operators...</span>
                </div>
              )}
              {!hasNextPage && allOperators.length > 0 && (
                <p className='text-sm text-muted-foreground'>No more operators to load</p>
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
      <h1 className='text-3xl font-bold'>Operators</h1>
      <Card>
        <div className='py-16'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <AlertCircle />
              </EmptyMedia>
              <EmptyTitle>Failed to load operators</EmptyTitle>
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
          <EmptyTitle>No operators found</EmptyTitle>
          <EmptyDescription>There are no operators to display at the moment.</EmptyDescription>
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
            No operator found with this address. Make sure the address is correct and try again.
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

export default Operators;
