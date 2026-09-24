import type { DataSet } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { getChain } from "@/constants/chains";
import { useAccountDataSets } from "@/hooks/useAccountDataSets";
import type { Network } from "@/types";
import {
  DatasetsEmptyState,
  DatasetsErrorState,
  DatasetsLoadingState,
  DatasetsSectionLayout,
  DatasetsTable,
} from "./components";

const stepClass = (isDisabled: boolean) => (isDisabled ? "pointer-events-none opacity-50" : "cursor-pointer");

/**
 * Previous/Next only: Previous is disabled on the first page, Next once there
 * is no further page. The datasets table fetches no total count, so it can
 * only step.
 */
export function DatasetsPagination({
  page,
  hasMore,
  onPageChange,
}: {
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious onClick={() => onPageChange(Math.max(1, page - 1))} className={stepClass(page === 1)} />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext onClick={() => onPageChange(page + 1)} className={stepClass(!hasMore)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** Stable identity so the table memo survives a render with no data yet. */
const NO_DATA_SETS: DataSet[] = [];

interface DatasetsSectionProps {
  /** The connected payer. Every dataset listed here has this account as its payer. */
  accountId: string;
  network: Network;
}

/**
 * The payer's Warm Storage datasets. The caller only mounts this once the
 * route's operator is confirmed to be the Warm Storage service.
 */
export const DatasetsSection: React.FC<DatasetsSectionProps> = ({ accountId, network }) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useAccountDataSets(accountId, page, { networkOverride: network });

  const { data: currentEpoch } = useBlockNumber({ chainId: getChain(network).id, watch: true });

  function renderResults() {
    if (isLoading) {
      return <DatasetsLoadingState />;
    }

    if (isError) {
      return <DatasetsErrorState />;
    }

    const dataSets = data?.dataSets ?? NO_DATA_SETS;

    if (dataSets.length === 0) {
      return <DatasetsEmptyState />;
    }

    return (
      <>
        <DatasetsTable data={dataSets} network={network} currentEpoch={currentEpoch} />
        {page > 1 || data?.hasMore ? (
          <DatasetsPagination page={page} hasMore={Boolean(data?.hasMore)} onPageChange={setPage} />
        ) : null}
      </>
    );
  }

  return <DatasetsSectionLayout>{renderResults()}</DatasetsSectionLayout>;
};
