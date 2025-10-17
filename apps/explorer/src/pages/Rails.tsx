import type { Rail, RailState } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyableText, StyledLink } from "@/components/shared";
import { getRailStateLabel, getRailStateVariant, RAIL_STATES } from "@/constants/railStates";
import useInfiniteRails, { type RailsFilter } from "@/hooks/useInfiniteRails";
import { formatDate, formatToken } from "@/utils/formatter";
import { formatHexForSearch } from "@/utils/hexUtils";

type SearchByOption = "railId" | "payer" | "payee" | "operator" | "state";

const Rails = () => {
  const [searchBy, setSearchBy] = useState<SearchByOption>("railId");
  const [searchInput, setSearchInput] = useState("");
  const [selectedState, setSelectedState] = useState<RailState | "">("");
  const [appliedFilters, setAppliedFilters] = useState<RailsFilter>({});

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } =
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
          <h1 className='text-3xl font-bold'>Rails</h1>
          <p className='text-muted-foreground'>Browse all payment rails on the network</p>
        </div>

        {/* Search Bar */}
        <Card className='p-4'>
          <div className='flex flex-col sm:flex-row gap-3'>
            <Select value={searchBy} onValueChange={handleSearchByValueChange}>
              <SelectTrigger className='w-full sm:w-[180px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='railId'>Rail ID</SelectItem>
                <SelectItem value='payer'>Payer Address</SelectItem>
                <SelectItem value='payee'>Payee Address</SelectItem>
                <SelectItem value='operator'>Operator Address</SelectItem>
                <SelectItem value='state'>State</SelectItem>
              </SelectContent>
            </Select>
            <div className='flex flex-1 gap-2'>
              {searchBy === "state" ? (
                <Select value={selectedState} onValueChange={(value) => setSelectedState(value as RailState)}>
                  <SelectTrigger className='flex-1'>
                    <SelectValue placeholder='Select rail state...' />
                  </SelectTrigger>
                  <SelectContent>
                    {RAIL_STATES.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder={searchBy === "railId" ? "Enter rail ID..." : "Enter address (0x...)..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className='flex-1'
                />
              )}
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
          </div>
        </Card>

        {/* Results */}
        {allRails.length === 0 && !hasActiveFilters ? (
          <EmptyStateInitial />
        ) : allRails.length === 0 && hasActiveFilters ? (
          <EmptyStateNoResults onClear={handleClearFilters} />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rail ID</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Payment Rate</TableHead>
                  <TableHead className='text-right'>Settled Amount</TableHead>
                  <TableHead className='text-right'>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRails.map((rail: Rail) => (
                  <TableRow key={rail.id}>
                    <TableCell className='font-medium'>
                      <StyledLink to={`/rail/${rail.railId}`}>{rail.railId.toString()}</StyledLink>
                    </TableCell>
                    <TableCell className='font-mono text-sm'>
                      <CopyableText
                        value={rail.payer.address}
                        to={`/account/${rail.payer.address}`}
                        monospace={true}
                        label='Account address'
                        truncate={true}
                        truncateLength={8}
                      />
                    </TableCell>
                    <TableCell className='font-mono text-sm'>
                      <CopyableText
                        value={rail.payee.address}
                        to={`/account/${rail.payee.address}`}
                        monospace={true}
                        label='Account address'
                        truncate={true}
                        truncateLength={8}
                      />
                    </TableCell>
                    <TableCell className='font-mono text-sm'>
                      <CopyableText
                        value={rail.operator.address}
                        to={`/operator/${rail.operator.address}`}
                        monospace={true}
                        label='Service address'
                        truncate={true}
                        truncateLength={8}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRailStateVariant(rail.state)}>{getRailStateLabel(rail.state)}</Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatToken(rail.paymentRate, rail.token.decimals, rail.token.symbol, 8)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 2)}
                    </TableCell>
                    <TableCell className='text-right text-muted-foreground'>{formatDate(rail.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Infinite scroll trigger */}
            <div ref={observerTarget} className='h-20 flex items-center justify-center'>
              {isFetchingNextPage && (
                <div className='flex items-center gap-2 text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span className='text-sm'>Loading more rails...</span>
                </div>
              )}
              {!hasNextPage && allRails.length > 0 && (
                <p className='text-sm text-muted-foreground'>No more rails to load</p>
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
        <Skeleton className='h-9 w-32' />
        <Skeleton className='h-5 w-64' />
      </div>
      <Card className='p-4'>
        <Skeleton className='h-10 w-full' />
      </Card>
      <Card>
        <div className='p-4 space-y-4'>
          {[...Array(10)].map((_, i) => (
            <div key={i} className='flex gap-4'>
              <Skeleton className='h-4 w-16' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-16' />
              <Skeleton className='h-4 flex-1' />
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
      <h1 className='text-3xl font-bold'>Rails</h1>
      <Card>
        <div className='py-16'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <AlertCircle />
              </EmptyMedia>
              <EmptyTitle>Failed to load rails</EmptyTitle>
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
          <EmptyTitle>No rails found</EmptyTitle>
          <EmptyDescription>There are no rails to display at the moment.</EmptyDescription>
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
          <EmptyDescription>Try adjusting your search filters to find what you're looking for.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onClear} variant='outline'>
            Clear Filters
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  </Card>
);

export default Rails;
