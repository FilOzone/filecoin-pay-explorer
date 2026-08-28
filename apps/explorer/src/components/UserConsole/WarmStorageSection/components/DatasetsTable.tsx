"use client";

import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Network } from "@/types";
import { buildDatasetColumns } from "../data/columnDefinitions";
import type { MockDataset } from "../data/mockDatasets";

type DatasetsTableProps = {
  datasets: MockDataset[];
  network: Network;
  onTerminate: (dataset: MockDataset) => void;
};

export const DatasetsTable = ({ datasets, network, onTerminate }: DatasetsTableProps) => {
  const columns = useMemo(() => buildDatasetColumns(onTerminate, network), [onTerminate, network]);
  const table = useReactTable({
    data: datasets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
};
