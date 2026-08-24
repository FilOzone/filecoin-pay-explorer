import type { Address } from "viem";

const LOCK_PREFIX = "filecoin-pay:squid-acquisition";

export async function withSquidAcquisitionLock<T>(
  lockManager: LockManager | undefined,
  owner: Address,
  operation: () => Promise<T> | T,
): Promise<T> {
  if (!lockManager) throw new Error("This browser cannot safely coordinate funding across tabs");
  return lockManager.request(
    `${LOCK_PREFIX}:${owner.toLowerCase()}`,
    { ifAvailable: true, mode: "exclusive" },
    (lock) => {
      if (!lock) throw new Error("This funding account is already active in another tab");
      return operation();
    },
  );
}
