import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ID } from "@filecoin-foundation/ui-filecoin/Table/ID";
import clsx from "clsx";
import { useState } from "react";
import { InlineTextLoader } from "@/components/shared";
import { useMuteDataSet } from "@/hooks/useMuteDataSet";
import type { Network } from "@/types";
import { isUserRejection } from "@/utils/wallet-errors";
import { TerminateDataSet } from "../../DatasetsSection/components/TerminateDataSet";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import type { RankedDataSet } from "../data/staleness";
import { SnoozeDialog } from "./SnoozeDialog";

type StaleQueueRowProps = RankedDataSet & {
  accountId: string;
  network: Network;
  canMute: boolean;
  /** Opened from an inactivity email link. */
  isLinked: boolean;
};

export function StaleQueueRow({
  dataSet,
  days,
  monthlySpend,
  accountId,
  network,
  canMute,
  isLinked,
}: StaleQueueRowProps) {
  const muteDataSet = useMuteDataSet(accountId);
  const [isSnoozeDialogOpen, setIsSnoozeDialogOpen] = useState(false);
  const dataSetId = dataSet.dataSetId.toString();
  const { token } = dataSet.pdpRail;
  const monthlySpendLabel =
    monthlySpend === undefined ? "—" : `${formatTokenAmount(monthlySpend, token.decimals, "up")} ${token.symbol}`;

  const showError = muteDataSet.isError && !isUserRejection(muteDataSet.error);

  return (
    <li
      id={`stale-dataset-${dataSetId}`}
      aria-current={isLinked ? "true" : undefined}
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 py-3",
        isLinked && "-mx-3 rounded-md bg-muted px-3",
      )}
    >
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
        <TerminateDataSet dataSet={dataSet} network={network} />
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
