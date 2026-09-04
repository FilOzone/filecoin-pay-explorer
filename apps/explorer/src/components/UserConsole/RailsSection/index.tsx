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
  RailsTable,
} from "./components";
import { SettleRailProvider } from "./context/SettleRailContext";
import type { RailTableRow } from "./types";

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

  const {
    data: rails,
    isLoading,
    isError,
  } = useAccountServiceRails(accountId, operatorAddress, page, {
    networkOverride: network,
  });

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

  const handleSearch = (railId: string) => {
    setSearchQuery(railId);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setPage(1);
  };

  // Search filters the fetched page only. Rail IDs are globally unique, so a
  // match outside the current page is a miss rather than a wrong row.
  const filteredRails = useMemo(() => {
    if (!rails || !searchQuery) {
      return rails ?? [];
    }

    return rails.filter((rail) => rail.railId.toString().includes(searchQuery));
  }, [rails, searchQuery]);

  const tableData = useMemo<RailTableRow[]>(
    () =>
      filteredRails.map((rail) => ({
        ...rail,
        isSettling: settlements.has(rail.railId.toString()),
      })),
    [filteredRails, settlements],
  );

  const totalPages = Math.max(1, Math.ceil(Number(totalRails) / ACCOUNT_SERVICE_RAILS_PAGE_SIZE));

  if (isLoading) {
    return <RailsLoadingState />;
  }

  if (isError) {
    return <RailsErrorState />;
  }

  if (!rails || rails.length === 0) {
    return <RailsEmptyInitial />;
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <h3 className='text-2xl font-medium'>Payment Rails</h3>
        </div>

        <RailsSearch onSearch={handleSearch} onClear={handleClearSearch} />

        {filteredRails.length === 0 ? (
          <RailsEmptyNoResults />
        ) : (
          <>
            <SettleRailProvider chainId={chain.id} onSettle={handleSettle}>
              <RailsTable data={tableData} />
            </SettleRailProvider>

            {/* Page numbers count the pair's rails, so they are meaningless while
                the fetched page is being filtered down by a search. */}
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
