import { isHex } from "viem";
import type { InputKind } from "./types";

export const isPositiveInteger = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[1-9]\d*$/.test(trimmed);
};

export const classifyInput = (raw: string): InputKind => {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };
  if (isPositiveInteger(trimmed)) return { kind: "railId", value: trimmed };
  if (isHex(trimmed)) return { kind: "hexAddress", value: trimmed };
  return { kind: "invalid" };
};
