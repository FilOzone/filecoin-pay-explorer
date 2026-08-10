"use client";

import type { RailState } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { cn } from "@filecoin-pay/ui/lib/utils";

interface RailStateBadgeProps {
  state: RailState;
  className?: string;
}

const RAIL_STATE_CONFIG = {
  ACTIVE: {
    label: "Active",
    dotColor: "bg-brand-300",
    textColor: "text-slate-800 dark:text-slate-200",
    description: "Payment is streaming at a non-zero rate.",
  },
  ZERORATE: {
    label: "Idle",
    dotColor: "bg-amber-500",
    textColor: "text-slate-800 dark:text-slate-200",
    description: "Payment rate is 0; nothing is currently accruing.",
  },
  TERMINATED: {
    label: "Terminated",
    dotColor: "bg-red-500",
    textColor: "text-slate-800 dark:text-slate-200",
    description: "Rail has ended; any remaining locked funds still need to be settled.",
  },
  FINALIZED: {
    label: "Finalized",
    dotColor: "bg-gray-500",
    textColor: "text-slate-800 dark:text-slate-200",
    description: "Rail is fully settled and closed.",
  },
} as const;

export function RailStateBadge({ state, className }: RailStateBadgeProps) {
  const config = state === "%future added value" ? RAIL_STATE_CONFIG.ZERORATE : RAIL_STATE_CONFIG[state];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("inline-flex items-center gap-2.5 cursor-help", className)}>
          <div className='relative'>
            {/* Outer glow ring */}
            <div className={cn("absolute inset-0 rounded-full blur-sm opacity-40", config.dotColor)} />
            {/* Inner dot */}
            <div className={cn("relative w-3 h-3 rounded-full", config.dotColor)} />
          </div>
          <span className={cn("font-medium text-lg", config.textColor)}>{config.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side='top'>{config.description}</TooltipContent>
    </Tooltip>
  );
}
