import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";

import type { Operator } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/column-definitions";

export type TopOperatorsTableProps = {
  data: Array<Operator>;
};

function TopOperatorsTable({ data }: TopOperatorsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default TopOperatorsTable;
