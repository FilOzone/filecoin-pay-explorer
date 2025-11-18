import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { Rail } from "@filecoin-pay/types";
import { columns } from "../data/columnDefinitions";

export type RailsTableProps = {
  data: Array<Rail & { userAddress: string }>;
};

function RailsTable({ data }: RailsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default RailsTable;
