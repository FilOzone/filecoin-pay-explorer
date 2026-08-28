"use client";

import { useCallback, useState } from "react";
import {
  DatasetsTable,
  ServiceMetricCards,
  StaleQueue,
  TerminateDatasetDialog,
  WarmStorageTourAutoStart,
} from "@/components/UserConsole/WarmStorageSection/components";
import { MOCK_DATASETS, type MockDataset } from "./data/mockDatasets";
import { isStale } from "./utils/datasetLifecycle";

export const WarmStorageSection = () => {
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
        <ServiceMetricCards datasets={datasets} />
      </div>

      <div data-tour='datasets-table'>
        <DatasetsTable datasets={datasets} onTerminate={handleTerminate} />
      </div>

      {staleDatasets.length > 0 ? (
        <div data-tour='stale-queue'>
          <StaleQueue datasets={staleDatasets} onTerminate={handleTerminate} />
        </div>
      ) : null}

      <TerminateDatasetDialog
        dataset={terminateTarget}
        onCancel={() => setTerminateTarget(null)}
        onConfirm={handleConfirmTerminate}
      />
    </div>
  );
};
