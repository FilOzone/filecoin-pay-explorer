import type { DataSet } from "@filecoin-pay/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { useState } from "react";
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
 * No total count is fetched for this list, so pagination can only step:
 * disable Previous on the first page, disable Next once no extra row came back.
 */
function DatasetsPagination({
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
        <DatasetsTable data={dataSets} network={network} />
        {page > 1 || data?.hasMore ? (
          <DatasetsPagination page={page} hasMore={Boolean(data?.hasMore)} onPageChange={setPage} />
        ) : null}
      </>
    );
  }

  return <DatasetsSectionLayout>{renderResults()}</DatasetsSectionLayout>;
};
