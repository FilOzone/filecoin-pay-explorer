import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { InlineTextLoader } from "@/components/shared";
import { isRailSettlementAllowed } from "@/utils/railSettlement";
import { useSettleRail } from "../context/SettleRailContext";
import type { RailTableRow } from "../types";

type RailActionsProps = {
  rail: RailTableRow;
};

const RailActions = ({ rail }: RailActionsProps) => {
  const { openSettleDialog } = useSettleRail();
  const isFinalized = rail.state === "FINALIZED";
  const isPaused = rail.state === "ZERORATE";
  const isSettlementAllowed = isRailSettlementAllowed(rail, rail.currentEpoch);
  const isPausedWithoutSettlement = isPaused && !isSettlementAllowed;
  const isDisabled = !isSettlementAllowed || rail.isSettling;

  let tooltipContent = "";
  if (isFinalized) {
    tooltipContent = "Rail is finalized and cannot be settled";
  } else if (rail.isSettling) {
    tooltipContent = "Settlement in progress...";
  } else if (rail.currentEpoch === undefined) {
    tooltipContent = "Loading the current epoch...";
  } else if (isPausedWithoutSettlement) {
    tooltipContent = "Paused rail has no unsettled payments";
  } else if (!isSettlementAllowed) {
    tooltipContent = "Rail is already settled up to the current epoch";
  }

  const button = (
    <Button variant='primary' className='px-4 py-2 my-4' onClick={() => openSettleDialog(rail)} disabled={isDisabled}>
      {rail.isSettling ? <InlineTextLoader text='Settling' /> : "Settle"}
    </Button>
  );

  if (isDisabled && tooltipContent) {
    return (
      <div className='flex justify-center'>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: makes the disabled action explanation keyboard-accessible */}
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipContent}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return <div className='flex justify-center'>{button}</div>;
};

export default RailActions;
