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

interface DatasetsSectionProps {
  /** The connected payer, which every listed dataset is paid by. */
  accountId: string;
  network: Network;
}

export const DatasetsSection: React.FC<DatasetsSectionProps> = ({ accountId, network }) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useAccountDataSets(accountId, page, { networkOverride: network });
  const { data: currentEpoch } = useBlockNumber({ chainId: getChain(network).id, watch: true });

  const dataSets = data?.dataSets ?? [];

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
