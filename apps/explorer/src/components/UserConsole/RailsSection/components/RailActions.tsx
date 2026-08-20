import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { InlineTextLoader } from "@/components/shared";
import { getRailSettlementEligibility, getRailSettlementUnavailableReason } from "@/utils/railSettlement";
import { useSettleRail } from "../context/SettleRailContext";
import type { RailTableRow } from "../types";

type RailActionsProps = {
  rail: RailTableRow;
};

const RailActions = ({ rail }: RailActionsProps) => {
  const { currentEpoch, openSettleDialog } = useSettleRail();
  const settlementEligibility = getRailSettlementEligibility(rail, currentEpoch);
  const isDisabled = settlementEligibility.status !== "allowed" || rail.isSettling;

  let tooltipContent = getRailSettlementUnavailableReason(settlementEligibility);
  if (settlementEligibility.status === "allowed" && rail.isSettling) {
    tooltipContent = "Settlement in progress...";
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
