import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { InlineTextLoader } from "@/components/shared";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { useSettleRail } from "../context/SettleRailContext";
import type { RailTableRow } from "../types";

type RailActionsProps = {
  rail: RailTableRow;
};

const RailActions = ({ rail }: RailActionsProps) => {
  const { openSettleDialog } = useSettleRail();
  const isFinalized = rail.state === "FINALIZED";
  const isDisabled = isFinalized || rail.isSettling;

  let tooltipContent = "";
  if (isFinalized) {
    tooltipContent = "Rail is finalized and cannot be settled";
  } else if (rail.isSettling) {
    tooltipContent = "Settlement in progress...";
  }

  const button = (
    <Button
      baseDomain={BASE_DOMAIN}
      variant='primary'
      className='px-4 py-2 my-4'
      onClick={() => openSettleDialog(rail)}
      disabled={isDisabled}
    >
      {rail.isSettling ? <InlineTextLoader text='Settling' /> : "Settle"}
    </Button>
  );

  if (isDisabled && tooltipContent) {
    return (
      <div className='flex justify-center'>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
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
