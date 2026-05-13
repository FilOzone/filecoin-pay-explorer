import type { Hex } from "viem";

export type ValidationError = {
  message: string;
};

export type InputKind =
  | { kind: "empty" }
  | { kind: "railId"; value: string }
  | { kind: "hexAddress"; value: Hex }
  | { kind: "invalid" };
