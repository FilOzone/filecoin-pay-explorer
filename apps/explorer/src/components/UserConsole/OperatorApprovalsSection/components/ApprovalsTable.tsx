import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { OperatorApproval } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { columns } from "../data/columnDefinitions";

export type ApprovalsTableProps = {
  data: Array<OperatorApproval & { onIncrease: (approval: OperatorApproval) => void }>;
};

function ApprovalsTable({ data }: ApprovalsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return <TanstackTable table={table} />;
}

export default ApprovalsTable;
