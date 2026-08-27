"use client";

import { Alert } from "@filecoin-foundation/ui-filecoin/Alert";
import { useCallback, useState } from "react";
import {
  DatasetsTable,
  ReleaseDatasetDialog,
  ServiceMetricCards,
  StaleQueue,
} from "@/components/UserConsole/WarmStorageSection/components";
import { MOCK_DATASETS, type MockDataset } from "./data/mockDatasets";
import { isStale } from "./utils/datasetLifecycle";

export const WarmStorageSection = () => {
  const [datasets, setDatasets] = useState<MockDataset[]>(MOCK_DATASETS);
  const [releaseTarget, setReleaseTarget] = useState<MockDataset | null>(null);
  // POC: kept ids only leave the triage queue. The real flow persists the
  // disposition and mutes inactivity alerts for the dataset.
  const [keptIds, setKeptIds] = useState<ReadonlySet<string>>(new Set());

  const handleRelease = useCallback((dataset: MockDataset) => setReleaseTarget(dataset), []);

  const handleKeep = useCallback((dataset: MockDataset) => {
    setKeptIds((current) => new Set(current).add(dataset.id));
  }, []);

  // POC: releasing just removes the row. The real flow terminates the
  // dataset's rails, settles, and emails a receipt via the notification service.
  const handleConfirmRelease = useCallback(() => {
    setReleaseTarget((target) => {
      if (target) setDatasets((current) => current.filter((d) => d.id !== target.id));
      return null;
    });
  }, []);

  const staleDatasets = datasets.filter((d) => isStale(d) && !keptIds.has(d.id));

  return (
    <div className='flex flex-col gap-6'>
      <Alert
        title='Proof of concept'
        description='Everything below renders mock data. Real rows come from indexed contract events (last write, proving) and FilBeam (retrieval).'
      />

      <ServiceMetricCards datasets={datasets} />

      {staleDatasets.length > 0 ? (
        <StaleQueue datasets={staleDatasets} onKeep={handleKeep} onRelease={handleRelease} />
      ) : null}

      <DatasetsTable datasets={datasets} onRelease={handleRelease} />

      <ReleaseDatasetDialog
        dataset={releaseTarget}
        onCancel={() => setReleaseTarget(null)}
        onConfirm={handleConfirmRelease}
      />
    </div>
  );
};
