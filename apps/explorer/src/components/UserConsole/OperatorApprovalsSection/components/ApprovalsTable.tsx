import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { OperatorApproval } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { createColumns } from "../data/columnDefinitions";

export type ApprovalsTableProps = {
  data: OperatorApproval[];
  onIncrease: (approval: OperatorApproval) => void;
};

function ApprovalsTable({ data, onIncrease }: ApprovalsTableProps) {
  const columns = useMemo(() => createColumns(onIncrease), [onIncrease]);
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

export default ApprovalsTable;
