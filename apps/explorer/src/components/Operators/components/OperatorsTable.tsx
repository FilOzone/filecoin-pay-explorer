import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Operator } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { InfiniteScrollLoader } from "@/components/shared";
import { columns } from "../data/column-definitions";

export type OperatorsTableProps = {
  data: Array<Operator>;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
};

function OperatorsTable({ data, observerTarget, isFetchingNextPage, hasNextPage }: OperatorsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  });

  return (
    <>
      <TanstackTable table={table} />
      <InfiniteScrollLoader
        observerTarget={observerTarget}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        hasData={data.length > 0}
        loadingMessage='Loading more operators...'
        endMessage='End of results'
      />
    </>
  );
}

export default OperatorsTable;
