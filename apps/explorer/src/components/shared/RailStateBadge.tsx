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
  // Use the underlying state for lifecycle (Active/Terminated/Finalized),
  // but add a one-time payment indicator when applicable
  const stateConfig = state === "%future added value" ? RAIL_STATE_CONFIG.ZERORATE : RAIL_STATE_CONFIG[state];

  // For active/idle one-time payment rails, use the blue badge.
  // For terminated/finalized, keep the lifecycle state but append the type.
  const isTerminalState = state === "TERMINATED" || state === "FINALIZED";
  const config = isOneTimePayment && !isTerminalState ? RAIL_STATE_CONFIG.ONE_TIME_PAYMENT : stateConfig;

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
