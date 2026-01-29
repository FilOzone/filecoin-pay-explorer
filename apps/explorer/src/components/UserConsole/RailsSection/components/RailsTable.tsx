import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Rail } from "@filecoin-pay/types";
import { createColumns } from "../data/columnDefinitions";

export type RailsTableProps = {
  data: Array<Rail & { userAddress: string }>;
  onSettle: (rail: Rail) => void;
};

function RailsTable({ data, onSettle }: RailsTableProps) {
  const columns = createColumns(onSettle);
  return <TanstackTable data={data} columns={columns} />;
}

export default RailsTable;
