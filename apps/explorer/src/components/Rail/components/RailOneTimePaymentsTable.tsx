import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { OneTimePayment } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/column-definitions-rail-one-time-payments";

export type RailOneTimePaymentsTableProps = {
  data: Array<OneTimePayment>;
};

function RailOneTimePaymentsTable({ data }: RailOneTimePaymentsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default RailOneTimePaymentsTable;
