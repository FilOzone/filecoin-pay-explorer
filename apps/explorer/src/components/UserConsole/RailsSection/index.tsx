import type { Account, Rail } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { getChain } from "@/constants/chains";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { useRailSettlements } from "@/hooks/useRailSettlements";
import { getNetworkFromChainId } from "@/utils/network";
import { RailsSearch, type SearchFilterType } from "../RailsSearch";
import { SettleRailDialog } from "../SettleRailDialog";
import { RailsEmptyInitial, RailsEmptyNoResults, RailsErrorState, RailsLoadingState, RailsTable } from "./components";
import type { RailTableRow } from "./types";

interface RailsSectionProps {
  account: Account;
  userAddress: string;
}

export const RailsSection: React.FC<RailsSectionProps> = ({ account, userAddress }) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilterType>("railId");
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);

  const chainId = useChainId();
  const { chain, walletNetwork } = useMemo(() => {
    const walletNetwork = getNetworkFromChainId(chainId);
    return {
      walletNetwork,
      chain: getChain(walletNetwork),
    };
  }, [chainId]);

  const { data, isLoading, isError } = useAccountRails(account.id, page, { networkOverride: walletNetwork });

  const { settleRail, isSettling, settlements } = useRailSettlements({
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  const handleSettle = (rail: Rail) => {
    setSelectedRail(rail);
    setSettleDialogOpen(true);
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

  // Prepare table data with userAddress, settlement state, and isPayer calculation
  const tableData = useMemo<RailTableRow[]>(
    () =>
      filteredRails.map((rail) => ({
        ...rail,
        userAddress,
        isPayer: rail.payer.address.toLowerCase() === userAddress.toLowerCase(),
        isSettling: settlements.has(rail.railId.toString()),
      })),
    [filteredRails, userAddress, settlements],
  );

  const totalPages = account.totalRails ? Math.ceil(Number(account.totalRails) / 10) : 1;

  if (isLoading) {
    return <RailsLoadingState />;
  }

  if (isError) {
    return <RailsErrorState />;
  }

  if (!data || data.rails.length === 0) {
    return <RailsEmptyInitial />;
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <h3 className='text-2xl font-medium'>Payment Rails</h3>
        </div>

        {/* Search */}
        <RailsSearch onSearch={handleSearch} onClear={handleClearSearch} />

        {/* Results */}
        {filteredRails.length === 0 ? (
          <RailsEmptyNoResults searchFilter={searchFilter} />
        ) : (
          <>
            <RailsTable data={tableData} onSettle={handleSettle} />

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
          isSettling={isSettling(selectedRail.railId.toString())}
          settleRail={settleRail}
        />
      )}
    </>
  );
};
