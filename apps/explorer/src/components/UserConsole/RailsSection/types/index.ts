import type { Rail } from "@filecoin-pay/types";

export type RailTableRow = Rail & {
  userAddress: string;
  isPayer: boolean;
  isSettling: boolean;
};
