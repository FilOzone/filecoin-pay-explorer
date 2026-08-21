import type { Rail } from "@filecoin-pay/types";

export type RailTableRow = Rail & {
  isPayer: boolean;
  isSettling: boolean;
};
