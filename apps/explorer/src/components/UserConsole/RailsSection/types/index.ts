import type { Rail } from "@filecoin-pay/types";

export type RailExtended = Rail & {
  userAddress: string;
  isPayer: boolean;
  isSettling: boolean;
};
