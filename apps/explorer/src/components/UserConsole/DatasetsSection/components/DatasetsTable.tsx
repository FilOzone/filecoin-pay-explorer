import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { DataSet } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import type { Network } from "@/types";
import { getDatasetColumns } from "../data/columnDefinitions";

export type DatasetsTableProps = {
  data: DataSet[];
  network: Network;
};

function DatasetsTable({ data, network }: DatasetsTableProps) {
  // Rebuilt columns would remount every cell, dropping an open or pending termination.
  const columns = useMemo(() => getDatasetColumns(network), [network]);

  const table = useReactTable({
    data,
    columns,
    // Index-based ids would hand a row's cell state to another dataset when a refresh reorders the page.
    getRowId: (dataSet) => dataSet.id,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return (
    <ResponsiveTable>
      <TanstackTable table={table} />
    </ResponsiveTable>
  );
}

export default DatasetsTable;
