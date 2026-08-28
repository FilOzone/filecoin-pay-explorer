"use client";

import { useCallback, useState } from "react";
import { useConnection } from "wagmi";
import { PocChip } from "@/components/UserConsole/PocChip";
import {
  DatasetsTable,
  ServiceMetricCards,
  SpendingLimits,
  StaleQueue,
  TerminateDatasetDialog,
  WarmStorageTourAutoStart,
} from "@/components/UserConsole/WarmStorageSection/components";
import { useAccountRails } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import { getNetworkFromChainId } from "@/utils/network";
import { rollupRailsByOperator } from "@/utils/railRollup";
import { MOCK_DATASETS, type MockDataset } from "./data/mockDatasets";
import { isStale } from "./utils/datasetLifecycle";

export const WarmStorageSection = () => {
  const { address, chainId } = useConnection();
  const network = getNetworkFromChainId(chainId);
  const { constants } = useSynapse();
  const fwssAddress = constants.chain.contracts.fwss.address.toLowerCase();

  // Real money: this wallet's rails, rolled up to the FWSS operator.
  // Page 1 only (10 rails) — the known rollup-pagination gap from the billing
  // POC applies here too and ships with the aggregation fix, not this POC.
  const { data: railsData } = useAccountRails(address?.toLowerCase() ?? "", 1, { networkOverride: network });
  const rollup = address
    ? rollupRailsByOperator(railsData?.rails ?? [], address).find((r) => r.operatorAddress === fwssAddress)
    : undefined;

  const [datasets, setDatasets] = useState<MockDataset[]>(MOCK_DATASETS);
  const [terminateTarget, setTerminateTarget] = useState<MockDataset | null>(null);

  const handleTerminate = useCallback((dataset: MockDataset) => setTerminateTarget(dataset), []);

  // POC: terminating just removes the row. The real flow terminates the
  // dataset's rails, settles, and emails a receipt via the notification service.
  const handleConfirmTerminate = useCallback(() => {
    setTerminateTarget((target) => {
      if (target) setDatasets((current) => current.filter((d) => d.id !== target.id));
      return null;
    });
  }, []);

  const staleDatasets = datasets.filter(isStale);

  return (
    <div className='flex flex-col gap-6'>
      <WarmStorageTourAutoStart />

      <div data-tour='metrics'>
        <ServiceMetricCards rollup={rollup} />
      </div>

      <div data-tour='datasets-table' className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <h3 className='font-medium'>Datasets</h3>
          <PocChip label='mock data — real rows need the FWSS subgraph' />
        </div>
        <DatasetsTable datasets={datasets} onTerminate={handleTerminate} />
      </div>

      {staleDatasets.length > 0 ? (
        <div data-tour='stale-queue'>
          <StaleQueue datasets={staleDatasets} onTerminate={handleTerminate} />
        </div>
      ) : null}

      <SpendingLimits />

      <TerminateDatasetDialog
        dataset={terminateTarget}
        onCancel={() => setTerminateTarget(null)}
        onConfirm={handleConfirmTerminate}
      />
    </div>
  );
};
