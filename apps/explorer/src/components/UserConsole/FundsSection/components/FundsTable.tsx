import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { UserToken } from "@filecoin-pay/types";
import { columns } from "../data/columnDefinitions";

export type FundsTableProps = {
  data: Array<UserToken & { onDeposit: (token: UserToken) => void; onWithdraw: (token: UserToken) => void }>;
};

function FundsTable({ data }: FundsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default FundsTable;
