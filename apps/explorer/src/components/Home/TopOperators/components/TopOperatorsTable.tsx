import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";

import type { Operator } from "@filecoin-pay/types";

import { columns } from "../data/column-definitions";

export type TopOperatorsTableProps = {
  data: Array<Operator>;
};

function TopOperatorsTable({ data }: TopOperatorsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default TopOperatorsTable;
