import type { Account, Rail } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { getChain } from "@/constants/chains";
import { knownAddresses } from "@/constants/known-addresses";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { useRailSettlements } from "@/hooks/useRailSettlements";
import { getNetworkFromChainId } from "@/utils/network";
import { RailsSearch, type SearchFilterType } from "../RailsSearch";
import { SettleRailDialog } from "../SettleRailDialog";
import {
  OperatorList,
  RailsEmptyInitial,
  RailsEmptyNoResults,
  RailsErrorState,
  RailsLoadingState,
  RailsTable,
} from "./components";
import { SettleRailProvider } from "./context/SettleRailContext";
import type { RailTableRow } from "./types";

interface RailsSectionProps {
  account: Account;
  userAddress: string;
}

export const RailsSection: React.FC<RailsSectionProps> = ({ account, userAddress }) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilterType>("railId");
  const [showFilters, setShowFilters] = useState(false);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);

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

  const handleManage = (operatorAddress: string) => {
    setSelectedOperator(operatorAddress);
    setSearchQuery("");
    setShowFilters(false);
    setPage(1);
  };

  const handleBack = () => {
    setSelectedOperator(null);
    setSearchQuery("");
    setShowFilters(false);
    setPage(1);
  };

  const filteredRails = useMemo(() => {
    const rails = data?.rails ?? [];

    const byOperator = selectedOperator
      ? rails.filter((r) => r.operator.address.toLowerCase() === selectedOperator)
      : rails;

    if (!searchQuery) return byOperator;

    return byOperator.filter((rail) => {
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
  }, [data, searchQuery, searchFilter, selectedOperator]);

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

  if (isLoading) return <RailsLoadingState />;
  if (isError) return <RailsErrorState />;
  if (!data || data.rails.length === 0) return <RailsEmptyInitial />;

  // Operator detail view
  if (selectedOperator) {
    const operatorName = knownAddresses[selectedOperator] ?? "Unknown operator";

    return (
      <>
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <button
                type='button'
                onClick={handleBack}
                className='flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors'
              >
                <ArrowLeft className='size-4' />
                All services
              </button>
              <span className='text-muted-foreground'>/</span>
              <span className='font-medium'>{operatorName}</span>
            </div>
            <button
              type='button'
              onClick={() => setShowFilters((prev) => !prev)}
              className={`relative rounded-lg p-2 transition-colors ${
                showFilters ? "bg-zinc-100 text-zinc-800" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
              }`}
            >
              <SlidersHorizontal className='size-5' />
              {searchQuery && <span className='absolute -top-0.5 -right-0.5 size-2 rounded-full bg-blue-500' />}
            </button>
          </div>

          {showFilters && <RailsSearch onSearch={handleSearch} onClear={handleClearSearch} />}

          {filteredRails.length === 0 ? (
            <RailsEmptyNoResults searchFilter={searchFilter} />
          ) : (
            <>
              <SettleRailProvider onSettle={handleSettle}>
                <RailsTable data={tableData} />
              </SettleRailProvider>

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
            open={settleDialogOpen}
            onOpenChange={setSettleDialogOpen}
            isSettling={isSettling(selectedRail.railId.toString())}
            settleRail={settleRail}
          />
        )}
      </>
    );
  }

  // Operator overview
  return (
    <>
      <div className='flex flex-col gap-4'>
        <h3 className='text-2xl font-medium'>Your services</h3>
        <OperatorList rails={data.rails} onManage={handleManage} />
      </div>

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
