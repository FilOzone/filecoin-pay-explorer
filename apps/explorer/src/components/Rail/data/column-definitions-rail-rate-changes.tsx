import type { RateChangeQueue } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { createColumnHelper } from "@tanstack/react-table";
import { EpochTimeCell } from "@/components/shared";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<RateChangeQueue & { currentEpoch: bigint | undefined }>();

export const columns = [
  columnHelper.accessor("startEpoch", {
    header: "Start Time",
    cell: (info) => {
      const { currentEpoch } = info.row.original;
      const epoch = BigInt(info.getValue()) + 1n;
      return (
        <div className='flex flex-col gap-0.5'>
          <EpochTimeCell epoch={epoch} currentEpoch={currentEpoch} granularity='datetime' className='font-medium' />
          <div className='text-xs text-muted-foreground'>Epoch {epoch.toString()}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor("untilEpoch", {
    header: "End Time",
    cell: (info) => {
      const { currentEpoch } = info.row.original;
      const epoch = BigInt(info.getValue());
      return (
        <div className='flex flex-col gap-0.5'>
          <EpochTimeCell epoch={epoch} currentEpoch={currentEpoch} granularity='datetime' className='font-medium' />
          <div className='text-xs text-muted-foreground'>Epoch {epoch.toString()}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor(
    (row) => ({
      rate: row.rate,
      token: row.rail.token,
    }),
    {
      header: "Rate/day",
      cell: (info) => {
        const { rate, token } = info.getValue();
        return formatToken(BigInt(rate) * TIME_CONSTANTS.EPOCHS_PER_DAY, token.decimals, token.symbol, 8);
      },
    },
  ),
];
