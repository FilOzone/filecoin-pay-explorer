import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { InlineTextLoader } from "@/components/shared";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import type { RailExtended } from "../types";

type RailActionsProps = {
  rail: RailExtended;
  onSettle: (rail: RailExtended) => void;
};

const RailActions = ({ rail, onSettle }: RailActionsProps) => {
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
      onClick={() => onSettle(rail)}
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
