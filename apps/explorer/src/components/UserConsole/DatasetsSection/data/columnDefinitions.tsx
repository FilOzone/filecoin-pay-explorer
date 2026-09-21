import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { DataSet } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { CopyableText, StyledLink } from "@/components/shared";
import type { Network } from "@/types";
import { formatBytes, formatDate, formatToken } from "@/utils/formatter";
import { monthlyDataSetSpend } from "./monthlySpend";

const columnHelper = createColumnHelper<DataSet>();

/** PDP Explorer indexes datasets by the same id FWSS assigns, under the same network names this app uses. */
const pdpExplorerUrl = (network: Network, dataSetId: bigint) =>
  `https://pdp.filecoin.cloud/${network}/dataset/${dataSetId}`;

export const getDatasetColumns = (network: Network) => [
  columnHelper.accessor("dataSetId", {
    id: "dataSetId",
    header: "ID",
    cell: (info) => <ID number={Number(info.getValue())} />,
  }),
  columnHelper.display({
    id: "provider",
    header: "Provider",
    cell: (info) => {
      const { provider } = info.row.original;
      return (
        <CopyableText
          className='text-sm font-medium'
          value={provider}
          to={`/accounts/${provider}`}
          monospace={true}
          label='Provider address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("totalSize", {
    id: "totalSize",
    header: () => <div className='text-right'>Size</div>,
    cell: (info) => <div className='text-right text-sm tabular-nums'>{formatBytes(info.getValue())}</div>,
  }),
  columnHelper.accessor("lastWriteAt", {
    id: "lastWriteAt",
    header: "Last Write",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "monthlySpend",
    header: () => <div className='text-right'>Monthly Spend</div>,
    cell: (info) => {
      const dataSet = info.row.original;
      const { token } = dataSet.pdpRail;
      return (
        <div className='text-right font-medium text-sm tabular-nums'>
          {formatToken(monthlyDataSetSpend(dataSet), token.decimals, token.symbol, 4)}
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "provingStatus",
    header: "Proving",
    cell: (info) => (
      <StyledLink
        href={pdpExplorerUrl(network, info.row.original.dataSetId)}
        external={true}
        showExternalIcon={true}
        className='text-sm'
      >
        PDP Explorer
      </StyledLink>
    ),
  }),
];
