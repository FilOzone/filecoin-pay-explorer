import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/columnDefinitions";
import type { RailTableRow } from "../types";

export type RailsTableProps = {
  data: Array<RailTableRow>;
};
function RailsTable({ data }: RailsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default RailsTable;
