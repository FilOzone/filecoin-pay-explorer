import type { RailState } from "@filecoin-pay/types";

export type RailStateVariant = "primary" | "secondary" | "tertiary" | "solid";

export const RAIL_STATES: ReadonlyArray<{ value: RailState; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "ZERORATE", label: "Idle" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "FINALIZED", label: "Finalized" },
] as const;

export const getRailStateLabel = (state: RailState): string => {
  return RAIL_STATES.find((s) => s.value === state)?.label ?? state;
};

const RAIL_STATE_VARIANTS: Record<Exclude<RailState, "%future added value">, RailStateVariant> = {
  ACTIVE: "primary",
  ZERORATE: "secondary",
  TERMINATED: "tertiary",
  FINALIZED: "solid",
};

export const getRailStateVariant = (state: RailState): RailStateVariant => {
  if (state === "%future added value") {
    return "secondary";
  }
  return RAIL_STATE_VARIANTS[state];
};
