import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Rail } from "@filecoin-pay/types";
import { InfiniteScrollLoader } from "@/components/shared";
import { columns } from "../data/column-definitions";

export type RailsTableProps = {
  data: Array<Rail>;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
};

function RailsTable({ data, observerTarget, isFetchingNextPage, hasNextPage }: RailsTableProps) {
  return (
    <>
      <TanstackTable data={data} columns={columns} />
      <InfiniteScrollLoader
        observerTarget={observerTarget}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        hasData={data.length > 0}
        loadingMessage='Loading more rails...'
        endMessage='End of results'
      />
    </>
  );
}

export default RailsTable;
