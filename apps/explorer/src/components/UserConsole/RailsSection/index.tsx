import type { Rail } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { useCallback, useMemo, useState } from "react";
import { getChain } from "@/constants/chains";
import { ACCOUNT_SERVICE_RAILS_PAGE_SIZE, useAccountServiceRails } from "@/hooks/useAccountServices";
import { useRailSettlements } from "@/hooks/useRailSettlements";
import type { Network } from "@/types";
import { SettleRailDialog } from "../SettleRailDialog";
import {
  RailsEmptyInitial,
  RailsEmptyNoResults,
  RailsErrorState,
  RailsLoadingState,
  RailsSearch,
  RailsSectionLayout,
  RailsTable,
} from "./components";
import { SettleRailProvider } from "./context/SettleRailContext";
import { toServiceRailsFilter } from "./rails-filter";
import type { RailTableRow } from "./types";

/**
 * Rails page two ways, and only the total distinguishes them. The unfiltered
 * list knows how many pages there are, because the pair carries a rail count.
 * A filtered list has no count, so it can only say whether another page came
 * back and must step rather than number.
 */
type RailsPaginationProps = {
  page: number;
  onPageChange: (page: number) => void;
} & ({ kind: "counted"; totalPages: number } | { kind: "stepped"; hasMore: boolean });

/** How many numbered links to offer before falling back to stepping. */
const MAX_PAGE_LINKS = 5;

const stepClass = (isDisabled: boolean) => (isDisabled ? "pointer-events-none opacity-50" : "cursor-pointer");

function RailsPagination(props: RailsPaginationProps) {
  const { page, onPageChange } = props;

  const isFirst = page === 1;
  const isLast = props.kind === "counted" ? page >= props.totalPages : !props.hasMore;
  const nextPage = props.kind === "counted" ? Math.min(props.totalPages, page + 1) : page + 1;

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious onClick={() => onPageChange(Math.max(1, page - 1))} className={stepClass(isFirst)} />
        </PaginationItem>

        {props.kind === "counted"
          ? Array.from({ length: Math.min(MAX_PAGE_LINKS, props.totalPages) }, (_, index) => index + 1).map(
              (pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    onClick={() => onPageChange(pageNumber)}
                    isActive={page === pageNumber}
                    className='cursor-pointer'
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ),
            )
          : null}

        <PaginationItem>
          <PaginationNext onClick={() => onPageChange(nextPage)} className={stepClass(isLast)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

interface RailsSectionProps {
  /** The connected payer. Every rail listed here has this account as its payer. */
  accountId: string;
  network: Network;
  operatorAddress: string;
  /** `AccountOperator.totalRails` for this pair — not the account-wide count. */
  totalRails: bigint;
  userAddress: string;
}

export const RailsSection: React.FC<RailsSectionProps> = ({
  accountId,
  network,
  operatorAddress,
  totalRails,
  userAddress,
}) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<bigint>();

  const chain = useMemo(() => getChain(network), [network]);

  const filter = useMemo(() => toServiceRailsFilter(searchQuery), [searchQuery]);
  const isFiltering = Boolean(filter.railId || filter.payee);

  const { data, isLoading, isError } = useAccountServiceRails(accountId, operatorAddress, page, filter, {
    networkOverride: network,
  });
  const rails = data?.rails ?? [];

  const { settleRail, isSettling, settlements } = useRailSettlements({
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  const handleSettle = useCallback((rail: Rail, epoch: bigint | undefined) => {
    setSelectedRail(rail);
    setCurrentEpoch(epoch);
    setSettleDialogOpen(true);
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setPage(1);
  };

  const tableData = useMemo<RailTableRow[]>(
    () =>
      rails.map((rail) => ({
        ...rail,
        isSettling: settlements.has(rail.railId.toString()),
      })),
    [rails, settlements],
  );

  const totalPages = Math.max(1, Math.ceil(Number(totalRails) / ACCOUNT_SERVICE_RAILS_PAGE_SIZE));

  // Derived from the pair's lifetime total, not the current page, so the search
  // box does not appear and vanish as pages and filters change.
  const hasRails = totalRails > 0n;

  function renderResults() {
    if (isLoading) {
      return <RailsLoadingState />;
    }

    if (isError) {
      return <RailsErrorState />;
    }

    if (rails.length === 0) {
      return isFiltering ? <RailsEmptyNoResults /> : <RailsEmptyInitial />;
    }

    return (
      <>
        <SettleRailProvider chainId={chain.id} onSettle={handleSettle}>
          <RailsTable data={tableData} />
        </SettleRailProvider>

        {renderPagination()}
      </>
    );
  }

  function renderPagination() {
    // A filtered set has no total, so it steps on hasMore alone.
    if (isFiltering) {
      if (page === 1 && !data?.hasMore) {
        return null;
      }

      return <RailsPagination kind='stepped' page={page} hasMore={Boolean(data?.hasMore)} onPageChange={setPage} />;
    }

    if (totalPages <= 1) {
      return null;
    }

    return <RailsPagination kind='counted' page={page} totalPages={totalPages} onPageChange={setPage} />;
  }

  return (
    <>
      <RailsSectionLayout>
        {hasRails ? (
          <RailsSearch appliedQuery={searchQuery} onSearch={handleSearch} onClear={handleClearSearch} />
        ) : null}

        {renderResults()}
      </RailsSectionLayout>

      {selectedRail && (
        <SettleRailDialog
          rail={selectedRail}
          userAddress={userAddress}
          currentEpoch={currentEpoch}
          open={settleDialogOpen}
          onOpenChange={setSettleDialogOpen}
          isSettling={isSettling(selectedRail.railId.toString())}
          settleRail={settleRail}
        />
      )}
    </>
  );
};
