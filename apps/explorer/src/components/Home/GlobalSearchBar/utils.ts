import { isHex } from "viem";
import type { InputKind } from "./types";

export const isPositiveInteger = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const num = Number(trimmed);
  return Number.isInteger(num) && num > 0 && String(num) === trimmed;
};

export const classifyInput = (raw: string): InputKind => {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };
  if (isPositiveInteger(trimmed)) return { kind: "railId", value: Number(trimmed) };
  if (isHex(trimmed)) return { kind: "hexAddress", value: trimmed };
  return { kind: "invalid" };
};
