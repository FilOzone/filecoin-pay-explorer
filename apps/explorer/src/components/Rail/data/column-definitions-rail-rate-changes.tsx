import type { RateChangeQueue } from "@filecoin-pay/types";
import { createColumnHelper } from "@tanstack/react-table";
import { EpochTime } from "@/components/shared";
import { formatToken } from "@/utils/formatter";

const columnHelper = createColumnHelper<RateChangeQueue & { currentEpoch: bigint | undefined }>();

export const columns = [
  columnHelper.accessor("startEpoch", {
    header: "Start Time",
    cell: (info) => {
      const { currentEpoch } = info.row.original;
      const epoch = info.getValue();
      return (
        <div className='flex flex-col gap-0.5'>
          <div className='font-medium'>
            {currentEpoch === undefined ? (
              "Loading..."
            ) : (
              <EpochTime epoch={epoch} currentEpoch={currentEpoch} granularity='datetime' showTooltip={false} />
            )}
          </div>
          <div className='text-xs text-muted-foreground'>Epoch {epoch.toString()}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor("untilEpoch", {
    header: "End Time",
    cell: (info) => {
      const { currentEpoch } = info.row.original;
      const epoch = info.getValue();
      return (
        <div className='flex flex-col gap-0.5'>
          <div className='font-medium'>
            {currentEpoch === undefined ? (
              "Loading..."
            ) : (
              <EpochTime epoch={epoch} currentEpoch={currentEpoch} granularity='datetime' showTooltip={false} />
            )}
          </div>
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
      header: "Rate",
      cell: (info) => {
        const { rate, token } = info.getValue();
        return formatToken(rate, token.decimals, token.symbol, 8);
      },
    },
  ),
];
