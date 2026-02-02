import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import { columns } from "../data/columnDefinitions";
import type { RailTableRow } from "../types";

export type RailsTableProps = {
  data: Array<RailTableRow>;
};

function RailsTable({ data }: RailsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default RailsTable;
