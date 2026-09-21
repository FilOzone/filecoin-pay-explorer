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
  const columns = useMemo(() => getDatasetColumns(network), [network]);

  const table = useReactTable({
    data,
    columns,
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
