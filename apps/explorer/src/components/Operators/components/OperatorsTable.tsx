import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Operator } from "@filecoin-pay/types";
import { InfiniteScrollLoader } from "@/components/shared";
import { columns } from "../data/column-definitions";

export type OperatorsTableProps = {
  data: Array<Operator>;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
};

function OperatorsTable({ data, observerTarget, isFetchingNextPage, hasNextPage }: OperatorsTableProps) {
  return (
    <>
      <TanstackTable data={data} columns={columns} />
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
