import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";

import type { Rail } from "@filecoin-pay/types";

import { columns } from "../data/column-definitions";

export type RecentRailsTableProps = {
  data: Array<Rail>;
};

function RecentRailsTable({ data }: RecentRailsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default RecentRailsTable;
