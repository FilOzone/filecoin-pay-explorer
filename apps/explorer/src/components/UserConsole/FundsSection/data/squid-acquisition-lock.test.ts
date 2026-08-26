import { describe, expect, it } from "vitest";
import { withSquidAcquisitionLock } from "./squid-acquisition-lock";

const owner = "0x1111111111111111111111111111111111111111" as const;

function createLockManager() {
  let active = false;
  return {
    request: async <T>(_name: string, _options: LockOptions, callback: (lock: Lock | null) => T | PromiseLike<T>) => {
      if (active) return callback(null);
      active = true;
      try {
        return await callback({} as Lock);
      } finally {
        active = false;
      }
    },
  } as LockManager;
}

describe("withSquidAcquisitionLock", () => {
  it("fails closed when the browser has no Web Locks implementation", async () => {
    await expect(withSquidAcquisitionLock(undefined, owner, () => undefined)).rejects.toThrow(
      "cannot safely coordinate",
    );
  });

  it("rejects an interleaved operation for the same owner", async () => {
    const lockManager = createLockManager();
    let release!: () => void;
    const first = withSquidAcquisitionLock(
      lockManager,
      owner,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await expect(withSquidAcquisitionLock(lockManager, owner, () => undefined)).rejects.toThrow(
      "already active in another tab",
    );
    release();
    await expect(first).resolves.toBeUndefined();
  });
});
