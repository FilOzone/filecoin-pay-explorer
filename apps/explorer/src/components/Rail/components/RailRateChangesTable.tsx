import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { RateChangeQueue } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/column-definitions-rail-rate-changes";

export type RailRateChangesTableProps = {
  data: Array<RateChangeQueue>;
};

function RailRateChangesTable({ data }: RailRateChangesTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default RailRateChangesTable;
