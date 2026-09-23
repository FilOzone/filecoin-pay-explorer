"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import type { DataSet } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { InlineTextLoader } from "@/components/shared";
import { isUserRejection, useMuteDataSet } from "@/hooks/useMuteDataSet";
import { formatTokenCeiling } from "@/utils/formatter";
import { daysInactive } from "../data/staleness";

type StaleQueueRowProps = {
  dataSet: DataSet;
  accountId: string;
  /** Pre-ranked by the caller; already resolved to 0 when not yet knowable. */
  spend: bigint;
  nowSeconds: bigint;
};

export function StaleQueueRow({ dataSet, accountId, spend, nowSeconds }: StaleQueueRowProps) {
  const muteDataSet = useMuteDataSet(accountId);
  const { token } = dataSet.pdpRail;
  const days = daysInactive(dataSet.lastWriteAt, nowSeconds);

  const showError = muteDataSet.isError && !isUserRejection(muteDataSet.error);

  return (
    <li className='flex flex-wrap items-center justify-between gap-3 py-3'>
      <div className='flex min-w-0 flex-col gap-1'>
        <ID number={Number(dataSet.dataSetId)} />
        <span className='text-xs text-muted-foreground'>
          {days.toString()} days inactive · {formatTokenCeiling(spend, token.decimals, token.symbol, 4)} spent since
        </span>
        {showError ? (
          <span className='text-xs text-destructive'>
            {muteDataSet.error instanceof Error ? muteDataSet.error.message : "Failed to mute this dataset."}
          </span>
        ) : null}
      </div>
      <div className='flex shrink-0 gap-2'>
        <Button
          variant='ghost'
          onClick={() => muteDataSet.mutate(dataSet.dataSetId.toString())}
          disabled={muteDataSet.isPending}
        >
          {muteDataSet.isPending ? <InlineTextLoader text='Keeping' /> : "Keep"}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: makes the disabled action explanation keyboard-accessible */}
            <span tabIndex={0}>
              <Button variant='ghost' disabled={true} className='text-destructive'>
                Terminate
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side='top'>Terminate ships with the dataset termination flow.</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
