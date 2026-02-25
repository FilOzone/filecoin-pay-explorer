import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Account } from "@filecoin-pay/types";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { InfiniteScrollLoader } from "@/components/shared";
import { columns } from "../data/column-definitions";

export type AccountsTableProps = {
  data: Array<Account>;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
};

function AccountsTable({ data, observerTarget, isFetchingNextPage, hasNextPage }: AccountsTableProps) {
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
        loadingMessage='Loading more accounts...'
        endMessage='End of results'
      />
    </>
  );
}

export default AccountsTable;
