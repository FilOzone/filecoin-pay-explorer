import { TanstackTable } from "@filecoin-foundation/ui-filecoin/Table/TanstackTable";
import type { OperatorApproval } from "@filecoin-pay/types";
import { columns } from "../data/columnDefinitions";

export type ApprovalsTableProps = {
  data: Array<OperatorApproval & { onIncrease: (approval: OperatorApproval) => void }>;
};

function ApprovalsTable({ data }: ApprovalsTableProps) {
  return <TanstackTable data={data} columns={columns} />;
}

export default ApprovalsTable;
