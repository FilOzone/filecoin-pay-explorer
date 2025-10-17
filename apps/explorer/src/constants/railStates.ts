import type { RailState } from "@filecoin-pay/types";

export const RAIL_STATES: ReadonlyArray<{ value: RailState; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "ZERORATE", label: "Idle" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "FINALIZED", label: "Finalized" },
] as const;

export const getRailStateLabel = (state: RailState): string => {
  return RAIL_STATES.find((s) => s.value === state)?.label ?? state;
};

const RAIL_STATE_VARIANTS: Record<
  Exclude<RailState, "%future added value">,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  ZERORATE: "secondary",
  TERMINATED: "destructive",
  FINALIZED: "outline",
};

export const getRailStateVariant = (state: RailState): "default" | "secondary" | "destructive" | "outline" => {
  if (state === "%future added value") {
    return "secondary";
  }
  return RAIL_STATE_VARIANTS[state];
};
