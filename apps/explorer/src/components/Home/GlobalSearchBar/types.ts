import type { Hex } from "viem";
import type { LookupResult } from "@/hooks/useAddressLookup";

export type InputKind =
  | { kind: "empty" }
  | { kind: "railId"; value: string }
  | { kind: "hexAddress"; value: Hex }
  | { kind: "invalid"; message: string };

/** A single actionable row in the search dropdown (combobox). */
export type SearchOption = { kind: "rail"; railId: string } | { kind: "address"; result: LookupResult };
