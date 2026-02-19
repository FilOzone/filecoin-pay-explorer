import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { UserToken } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/columnDefinitions";

export type FundsTableProps = {
  data: Array<UserToken & { onDeposit: (token: UserToken) => void; onWithdraw: (token: UserToken) => void }>;
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
