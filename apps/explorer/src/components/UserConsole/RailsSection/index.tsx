import type { Rail } from "@filecoin-pay/types";
import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";
import { ListPagination } from "@/components/shared/ListPagination";
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
import { parseServiceRailsSearch } from "./rails-filter";
import type { RailTableRow } from "./types";

/** Stable identity so the table memo survives a render with no data yet. */
const NO_RAILS: Rail[] = [];

/**
 * The rail being settled and the epoch read when its dialog opened; null until a rail is first chosen. Closing keeps
 * the rail so the dialog stays mounted for its leave transition.
 */
type SettleSelection = { rail: Rail; currentEpoch: bigint | undefined; open: boolean } | null;

interface RailsSectionProps {
  /** The connected payer. Every rail listed here has this account as its payer. */
  accountId: string;
  network: Network;
  operatorAddress: string;
  /** `AccountOperator.totalRails` for this pair — not the account-wide count. */
  totalRails: bigint;
  userAddress: Address;
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
  const [settleSelection, setSettleSelection] = useState<SettleSelection>(null);

  const chain = getChain(network);

  const { filter, summary } = useMemo(() => parseServiceRailsSearch(searchQuery), [searchQuery]);
  const isFiltering = Boolean(summary);

  const { data, isLoading, isError } = useAccountServiceRails(accountId, operatorAddress, page, filter, {
    networkOverride: network,
  });
  const rails = data?.rails ?? NO_RAILS;

  const { settleRail, isSettling } = useRailSettlements({
    account: userAddress,
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  const handleSettle = useCallback((rail: Rail, currentEpoch: bigint | undefined) => {
    setSettleSelection({ rail, currentEpoch, open: true });
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const tableData = useMemo<RailTableRow[]>(
    () =>
      rails.map((rail) => ({
        ...rail,
        isSettling: isSettling(rail.railId),
      })),
    [rails, isSettling],
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

      return <ListPagination kind='stepped' page={page} hasMore={Boolean(data?.hasMore)} onPageChange={setPage} />;
    }

    if (totalPages <= 1) {
      return null;
    }

    return <ListPagination kind='counted' page={page} totalPages={totalPages} onPageChange={setPage} />;
  }

  return (
    <>
      <RailsSectionLayout>
        {hasRails ? <RailsSearch appliedQuery={searchQuery} onSearch={handleSearch} /> : null}

        {renderResults()}
      </RailsSectionLayout>

      {settleSelection && (
        <SettleRailDialog
          chainId={chain.id}
          rail={settleSelection.rail}
          userAddress={userAddress}
          currentEpoch={settleSelection.currentEpoch}
          open={settleSelection.open}
          onOpenChange={(open) => setSettleSelection({ ...settleSelection, open })}
          isSettling={isSettling(settleSelection.rail.railId)}
          settleRail={settleRail}
        />
      )}
    </>
  );
};
