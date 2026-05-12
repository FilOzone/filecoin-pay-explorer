import type { RailState } from "@filecoin-pay/types";

export const RAIL_STATES: ReadonlyArray<{ value: RailState; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "ZERORATE", label: "Idle" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "FINALIZED", label: "Finalized" },
] as const;
