import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";

import type { Account } from "@filecoin-pay/types";

import { columns } from "../data/column-definitions";

export type TopAccountsTableProps = {
  data: Array<Account>;
};

function TopAccountsTable({ data }: TopAccountsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default TopAccountsTable;
