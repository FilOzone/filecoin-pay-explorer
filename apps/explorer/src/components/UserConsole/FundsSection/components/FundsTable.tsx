import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns, type FundsTableRow } from "../data/columnDefinitions";

export type FundsTableProps = {
  data: FundsTableRow[];
};

function FundsTable({ data }: FundsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default FundsTable;
