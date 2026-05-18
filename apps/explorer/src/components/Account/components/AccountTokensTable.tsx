import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { UserToken } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/column-definitions-account-tokens";

export type AccountTokensTableProps = {
  data: Array<UserToken>;
};

function AccountTokensTable({ data }: AccountTokensTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default AccountTokensTable;
