import { isHex } from "viem";
import type { InputKind } from "./types";

export const classifyInput = (raw: string): InputKind => {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  if (/^\d+$/.test(trimmed)) {
    // Strip leading zeros so "007" resolves to rail 7; an all-zero value has no rail.
    const railId = trimmed.replace(/^0+/, "");
    if (!railId) return { kind: "invalid", message: "Rail IDs start at 1." };
    return { kind: "railId", value: railId };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("0x")) {
    // Non-empty valid hex is a usable address; "0x" alone or bad chars are not.
    if (lower !== "0x" && isHex(trimmed)) return { kind: "hexAddress", value: trimmed };
    return { kind: "invalid", message: "Enter a valid hex address." };
  }

  return { kind: "invalid", message: "Enter a valid Rail ID or address (0x...)." };
};
