"use client";

import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { buildDatasetColumns } from "../data/columnDefinitions";
import type { MockDataset } from "../data/mockDatasets";

type DatasetsTableProps = {
  datasets: MockDataset[];
  onRelease: (dataset: MockDataset) => void;
};

export const DatasetsTable = ({ datasets, onRelease }: DatasetsTableProps) => {
  const columns = useMemo(() => buildDatasetColumns(onRelease), [onRelease]);
  const table = useReactTable({
    data: datasets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
};
