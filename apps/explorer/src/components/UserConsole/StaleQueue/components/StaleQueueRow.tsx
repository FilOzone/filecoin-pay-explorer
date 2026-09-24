import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { useState } from "react";
import { InlineTextLoader } from "@/components/shared";
import { useMuteDataSet } from "@/hooks/useMuteDataSet";
import { formatTokenCeiling } from "@/utils/formatter";
import { isUserRejection } from "@/utils/wallet-errors";
import type { RankedDataSet } from "../data/staleness";
import { SnoozeDialog } from "./SnoozeDialog";

type StaleQueueRowProps = RankedDataSet & {
  accountId: string;
  canMute: boolean;
};

export function StaleQueueRow({ dataSet, days, monthlySpend, accountId, canMute }: StaleQueueRowProps) {
  const muteDataSet = useMuteDataSet(accountId);
  const [isSnoozeDialogOpen, setIsSnoozeDialogOpen] = useState(false);
  const dataSetId = dataSet.dataSetId.toString();
  const { token } = dataSet.pdpRail;
  const monthlySpendLabel =
    monthlySpend === undefined ? "—" : formatTokenCeiling(monthlySpend, token.decimals, token.symbol, 4);

  const showError = muteDataSet.isError && !isUserRejection(muteDataSet.error);

  return (
    <li className='flex flex-wrap items-center justify-between gap-3 py-3'>
      <div className='flex min-w-0 flex-col gap-1'>
        <ID number={Number(dataSet.dataSetId)} />
        <span className='text-xs text-muted-foreground'>
          {days.toString()} days inactive · {monthlySpendLabel} per month
        </span>
        {showError ? (
          <span className='text-xs text-destructive'>
            {muteDataSet.error instanceof Error ? muteDataSet.error.message : "Failed to mute this dataset."}
          </span>
        ) : null}
      </div>
      <div className='flex shrink-0 gap-2'>
        {canMute ? (
          <Button variant='ghost' onClick={() => setIsSnoozeDialogOpen(true)} disabled={muteDataSet.isPending}>
            {muteDataSet.isPending ? <InlineTextLoader text='Keeping' /> : "Keep"}
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: makes the disabled action explanation keyboard-accessible */}
            <span tabIndex={0}>
              <Button variant='ghost' disabled={true} className='text-destructive'>
                Terminate
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side='top'>Terminating datasets from the console isn't available yet.</TooltipContent>
        </Tooltip>
      </div>
      {isSnoozeDialogOpen ? (
        <SnoozeDialog
          dataSetId={dataSetId}
          onCancel={() => setIsSnoozeDialogOpen(false)}
          onConfirm={(mutedUntil) => {
            setIsSnoozeDialogOpen(false);
            muteDataSet.mutate({ dataSetId, mutedUntil });
          }}
        />
      ) : null}
    </li>
  );
}
