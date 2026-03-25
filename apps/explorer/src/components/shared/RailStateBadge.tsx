import type { RailState } from "@filecoin-pay/types";
import { cn } from "@filecoin-pay/ui/lib/utils";

interface StateConfig {
  label: string;
  dotColor: string;
  textColor: string;
}

interface RailStateBadgeProps {
  state: RailState;
  isOneTimePayment?: boolean;
  className?: string;
}

type StateKey = Exclude<RailState, "%future added value"> | "ONE_TIME_PAYMENT";

const RAIL_STATE_CONFIG: Record<StateKey, StateConfig> = {
  ACTIVE: {
    label: "Active",
    dotColor: "bg-brand-300",
    textColor: "text-slate-800 dark:text-slate-200",
  },
  ZERORATE: {
    label: "Idle",
    dotColor: "bg-amber-500",
    textColor: "text-slate-800 dark:text-slate-200",
  },
  TERMINATED: {
    label: "Terminated",
    dotColor: "bg-red-500",
    textColor: "text-slate-800 dark:text-slate-200",
  },
  FINALIZED: {
    label: "Finalized",
    dotColor: "bg-gray-500",
    textColor: "text-slate-800 dark:text-slate-200",
  },
  ONE_TIME_PAYMENT: {
    label: "One-Time Payment",
    dotColor: "bg-blue-500",
    textColor: "text-slate-800 dark:text-slate-200",
  },
};

export function RailStateBadge({ state, isOneTimePayment, className }: RailStateBadgeProps) {
  let config: StateConfig;
  if (isOneTimePayment) {
    config = RAIL_STATE_CONFIG.ONE_TIME_PAYMENT;
  } else if (state === "%future added value") {
    config = RAIL_STATE_CONFIG.ZERORATE;
  } else {
    config = RAIL_STATE_CONFIG[state];
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div className='relative'>
        {/* Outer glow ring */}
        <div className={cn("absolute inset-0 rounded-full blur-sm opacity-40", config.dotColor)} />
        {/* Inner dot */}
        <div className={cn("relative w-3 h-3 rounded-full", config.dotColor)} />
      </div>
      <span className={cn("font-medium text-lg", config.textColor)}>{config.label}</span>
    </div>
  );
}
