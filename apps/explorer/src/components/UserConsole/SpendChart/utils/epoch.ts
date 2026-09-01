import { EPOCH_DURATION } from "@/utils/constants";

/**
 * Converts a unix second to the epoch containing it, anchored on the chain's
 * genesis.
 *
 * Not `formatter.ts`'s `epochToDate`, which anchors on `Date.now()` plus an
 * epoch delta. That is accurate enough for "funded until", where the delta is
 * small and the answer is a rounded phrase, but it drifts over the six-month
 * span this chart covers. Anchoring on genesis makes the mapping absolute.
 */
export const timestampToEpoch = (timestampSeconds: bigint, genesisTimestamp: bigint | number): bigint =>
  (timestampSeconds - BigInt(genesisTimestamp)) / BigInt(EPOCH_DURATION);
