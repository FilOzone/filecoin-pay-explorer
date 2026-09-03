"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";

const BETA_NOTE =
  "This console is in beta and interacts directly with smart contracts on Filecoin. Check every transaction before confirming.";

/** Replaces the banner that headed every console page; the caution sits one hover away. */
export const BetaBadge = () => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        aria-label={`Beta. ${BETA_NOTE}`}
        className='rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'
        type='button'
      >
        Beta
      </button>
    </TooltipTrigger>
    <TooltipContent className='max-w-xs' side='bottom'>
      {BETA_NOTE}
    </TooltipContent>
  </Tooltip>
);
