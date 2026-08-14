import type { Rail } from "@filecoin-pay/types";

export type RailTableRow = Rail & {
  currentEpoch: bigint | undefined;
  userAddress: string;
  isPayer: boolean;
  isSettling: boolean;
};
