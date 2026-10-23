import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { ListPagination } from "@/components/shared/ListPagination";
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
import { monthlyDataSetSpend } from "./data/monthlySpend";

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

  const dataSets = data?.dataSets ?? [];
  // Spend that can't be estimated without the epoch (a terminated rail) is the only reason to watch blocks.
  const needsEpoch = dataSets.some((dataSet) => monthlyDataSetSpend(dataSet, undefined) === undefined);
  const { data: currentEpoch } = useBlockNumber({
    chainId: getChain(network).id,
    watch: needsEpoch,
    query: { enabled: needsEpoch },
  });

  function renderResults() {
    if (isLoading) {
      return <DatasetsLoadingState />;
    }

    if (isError) {
      return <DatasetsErrorState />;
    }

    if (dataSets.length === 0) {
      return <DatasetsEmptyState />;
    }

    return (
      <>
        <DatasetsTable data={dataSets} network={network} currentEpoch={currentEpoch} />
        {page > 1 || data?.hasMore ? (
          <ListPagination kind='stepped' page={page} hasMore={Boolean(data?.hasMore)} onPageChange={setPage} />
        ) : null}
      </>
    );
  }

  return <DatasetsSectionLayout>{renderResults()}</DatasetsSectionLayout>;
};
