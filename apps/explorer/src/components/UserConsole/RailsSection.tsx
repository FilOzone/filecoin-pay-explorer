import type { Account, Rail } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
// import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
// import { Spinner } from "@filecoin-pay/ui/components/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress, formatDate, formatToken } from "@/utils/formatter";
import { CopyableText } from "../shared";
import { RailsSearch, type SearchFilterType } from "./RailsSearch";
import { SettleRailDialog } from "./SettleRailDialog";

interface RailsSectionProps {
  account: Account;
  userAddress: string;
}

export const RailsSectionSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h2 className='text-2xl font-semibold'>Payment Rails</h2>
    </div>
    <Skeleton className='h-12 w-full' />
    <Card>
      <div className='p-4 space-y-4'>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className='h-32 w-full' />
        ))}
      </div>
    </Card>
  </div>
);

interface RailCardProps {
  rail: Rail;
  userAddress: string;
  onSettle: (rail: Rail) => void;
  onTerminate: (rail: Rail) => void;
  isTerminating: boolean;
}

const RailCard: React.FC<RailCardProps> = ({ rail, userAddress }) => {
  const isPayer = rail.payer.address.toLowerCase() === userAddress.toLowerCase();
  const counterparty = isPayer ? rail.payee : rail.payer;

  return (
    <div className='flex flex-col sm:flex-row items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors'>
      <div className='flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 w-full'>
        {/* Rail ID & Role */}
        <div>
          <span className='text-xs text-muted-foreground'>Rail ID</span>
          <div className='flex items-center gap-2'>
            <Link to={`/rail/${rail.railId}`} className='text-lg font-semibold'>
              #{rail.railId.toString()}
            </Link>
            <Badge variant={isPayer ? "destructive" : "default"} className='gap-1'>
              {isPayer ? (
                <>
                  <ArrowUpRight className='h-3 w-3' />
                  Payer
                </>
              ) : (
                <>
                  <ArrowDownLeft className='h-3 w-3' />
                  Payee
                </>
              )}
            </Badge>
          </div>
          <div className='text-xs text-muted-foreground mt-1'>{formatDate(rail.createdAt)}</div>
        </div>

        {/* Counterparty & Operator */}
        <div>
          <span className='text-xs text-muted-foreground'>Counterparty</span>
          <CopyableText
            className='text-sm font-medium'
            value={counterparty.address}
            to={`/account/${counterparty.address}`}
            monospace={true}
            label='Account address'
            truncate={true}
            truncateLength={8}
          />
          <div className='text-xs text-muted-foreground mt-1'>Operator: {formatAddress(rail.operator.address)}</div>
        </div>

        {/* Payment Details */}
        <div>
          <span className='text-xs text-muted-foreground'>Payment Rate</span>
          <div className='font-medium text-sm'>
            {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
          </div>
          <div className='text-xs text-muted-foreground mt-1'>
            Settled: {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
          </div>
        </div>

        {/* State & Lockup */}
        <div>
          <span className='text-xs text-muted-foreground'>State</span>
          <div className='mt-1'>
            <Badge variant={getRailStateVariant(rail.state)}>{getRailStateLabel(rail.state)}</Badge>
          </div>
          <div className='text-xs text-muted-foreground mt-1'>Lockup: {rail.lockupPeriod.toString()} epochs</div>
        </div>
      </div>

      {/* TODO: Uncomment after fixing Rail settlement and termination contract calls */}
      {/* Actions */}
      {/* <Button
        size='sm'
        variant='outline'
        onClick={() => onSettle(rail)}
        className='gap-2 sm:ml-4'
        disabled={rail.state === "FINALIZED"}
      >
        <CheckCircle className='h-4 w-4' />
        Settle
      </Button>
      {(rail.state == "ACTIVE" || rail.state === "ZERORATE") && (
        <Button
          size='sm'
          variant='destructive'
          onClick={() => onTerminate(rail)}
          className='gap-2'
          disabled={isTerminating}
        >
          {isTerminating ? <Spinner /> : <X className='h-4 w-4' />}
          Terminate
        </Button>
      )} */}
    </div>
  );
};

export const RailsSection: React.FC<RailsSectionProps> = ({ account, userAddress }) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilterType>("railId");
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);
  const [terminatingRailId, setTerminatingRailId] = useState<string | null>(null);

  const { data, isLoading, isError } = useAccountRails(account.id, page);

  const { constants } = useSynapse();
  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
    onError: (err) => console.log("[TerminateRail] Failed: ", err),
  });

  const handleSettle = (rail: Rail) => {
    setSelectedRail(rail);
    setSettleDialogOpen(true);
  };

  // TODO: Fix and test Rail termination
  const handleTerminate = async (rail: Rail) => {
    try {
      setTerminatingRailId(rail.railId.toString());
      await execute({
        functionName: "terminateRail",
        args: [rail.railId],
        metadata: {
          type: "terminateRail",
          railId: rail.railId.toString(),
        },
      });
    } catch (err) {
      console.log("[TerminateRail] Failed: ", err);
    }
  };

  const handleSearch = (query: string, filterType: SearchFilterType) => {
    setSearchQuery(query.toLowerCase());
    setSearchFilter(filterType);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setPage(1);
  };

  // Filter rails based on search
  const filteredRails = useMemo(() => {
    if (!data || !searchQuery) return data?.rails || [];

    return data.rails.filter((rail) => {
      switch (searchFilter) {
        case "railId":
          return rail.railId.toString().includes(searchQuery);
        case "operator":
          return rail.operator.address.toLowerCase().includes(searchQuery);
        case "payer":
          return rail.payer.address.toLowerCase().includes(searchQuery);
        case "payee":
          return rail.payee.address.toLowerCase().includes(searchQuery);
        default:
          return true;
      }
    });
  }, [data, searchQuery, searchFilter]);

  const totalPages = account.totalRails ? Math.ceil(Number(account.totalRails) / 10) : 1;

  if (isLoading) {
    return <RailsSectionSkeleton />;
  }

  if (isError) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Payment Rails</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <AlertCircle className='h-12 w-12 text-muted-foreground' />
                <EmptyTitle>Failed to load rails</EmptyTitle>
                <EmptyDescription>Unable to fetch your payment rails. Please try again.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.rails.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Payment Rails</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <FileText className='h-12 w-12 text-muted-foreground' />
                <EmptyTitle>No payment rails</EmptyTitle>
                <EmptyDescription>
                  You don't have any active payment rails yet. Create a rail to start sending or receiving payments.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <h2 className='text-2xl font-semibold'>Payment Rails</h2>
          <span className='text-sm text-muted-foreground'>{account.totalRails.toString()} total</span>
        </div>

        {/* Search */}
        <RailsSearch onSearch={handleSearch} onClear={handleClearSearch} />

        {/* Results */}
        {filteredRails.length === 0 ? (
          <Card>
            <div className='py-12'>
              <Empty>
                <EmptyHeader>
                  <Search className='h-12 w-12 text-muted-foreground' />
                  <EmptyTitle>No results found</EmptyTitle>
                  <EmptyDescription>
                    No rails match your search criteria. Try a different {searchFilter}.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </Card>
        ) : (
          <>
            <div className='space-y-3'>
              {filteredRails.map((rail) => (
                <RailCard
                  key={rail.id}
                  rail={rail}
                  userAddress={userAddress}
                  onSettle={handleSettle}
                  onTerminate={handleTerminate}
                  isTerminating={isExecuting && terminatingRailId === rail.railId.toString()}
                />
              ))}
            </div>

            {/* Pagination - only show if not searching */}
            {!searchQuery && totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPage(pageNum)}
                          isActive={page === pageNum}
                          className='cursor-pointer'
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>

      {/* Settle Dialog */}
      {selectedRail && (
        <SettleRailDialog
          rail={selectedRail}
          userAddress={userAddress}
          open={settleDialogOpen}
          onOpenChange={setSettleDialogOpen}
        />
      )}
    </>
  );
};
