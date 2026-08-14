import type { Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { formatEpochDuration, formatToken } from "@/utils/formatter";
import { EpochTimeCell } from "../../shared";
import type { SettlementAmountState } from "./useSettleRailDialog";

interface EpochRowProps {
  label: string;
  epoch: bigint;
  currentEpoch: bigint | undefined;
}

const EpochRow = ({ label, epoch, currentEpoch }: EpochRowProps) => (
  <div className='flex justify-between items-start'>
    <span className='text-muted-foreground'>{label}:</span>
    <div className='text-right'>
      <EpochTimeCell
        epoch={epoch}
        currentEpoch={currentEpoch}
        granularity='datetime'
        className='font-mono font-medium'
      />
      {currentEpoch !== undefined && <div className='text-xs text-muted-foreground'>Epoch {epoch.toString()}</div>}
    </div>
  </div>
);

function formatSettlementAmount(state: SettlementAmountState, rail: Rail): string {
  switch (state.status) {
    case "loading":
      return "Loading...";
    case "error":
      return "Unavailable";
    case "ready":
      return formatToken(state.amount, rail.token.decimals, rail.token.symbol, 8);
    case "unavailable":
      return "—";
  }
}

interface SettlementDetailsProps {
  rail: Rail;
  settlementEpoch: bigint | undefined;
  settledUptoEpoch: bigint;
  epochsSinceLastSettlement: bigint;
  settlementAmountState: SettlementAmountState;
}

export const SettlementDetails = ({
  rail,
  settlementEpoch,
  settledUptoEpoch,
  epochsSinceLastSettlement,
  settlementAmountState,
}: SettlementDetailsProps) => {
  const epochsToSettleText =
    settlementEpoch === undefined ? "Loading..." : formatEpochDuration(epochsSinceLastSettlement);

  return (
    <div className='grid gap-3 p-4 rounded-lg border'>
      <div className='grid gap-2 text-sm'>
        <EpochRow label='Settlement Epoch' epoch={settlementEpoch ?? 0n} currentEpoch={settlementEpoch} />
        <EpochRow label='Settled Up To' epoch={settledUptoEpoch} currentEpoch={settlementEpoch} />

        <div className='flex justify-between items-start'>
          <span className='text-muted-foreground'>Epochs to Settle:</span>
          <div className='text-right'>
            <div className='font-mono font-medium'>{epochsToSettleText}</div>
            {settlementEpoch !== undefined && (
              <div className='text-xs text-muted-foreground'>{epochsSinceLastSettlement.toString()} epochs</div>
            )}
          </div>
        </div>

        <div className='h-px bg-border my-1' />

        <div className='flex justify-between items-center'>
          <span className='text-muted-foreground'>Payment Rate:</span>
          <span className='font-mono font-medium'>
            {formatToken(
              BigInt(rail.paymentRate) * TIME_CONSTANTS.EPOCHS_PER_DAY,
              rail.token.decimals,
              `${rail.token.symbol}/day`,
              12,
            )}
          </span>
        </div>

        <div className='flex justify-between items-center'>
          <span className='text-muted-foreground'>Historical Settled:</span>
          <span className='font-mono font-medium'>
            {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
          </span>
        </div>

        <div className='h-px bg-border my-1' />

        <div className='flex justify-between items-center py-2 px-3 rounded-md bg-primary/5'>
          <span className='font-medium'>Settlement Amount:</span>
          <span className='font-mono font-semibold text-lg'>{formatSettlementAmount(settlementAmountState, rail)}</span>
        </div>
      </div>
    </div>
  );
};
