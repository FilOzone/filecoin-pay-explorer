import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";

import type { Account } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/column-definitions";

export type TopAccountsTableProps = {
  data: Array<Account>;
};

function TopAccountsTable({ data }: TopAccountsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default TopAccountsTable;
