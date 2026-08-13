import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  beginSquidAcquisition,
  clearSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidBroadcast,
  markSquidDepositPending,
} from "./squid-acquisition";

const owner = "0x1111111111111111111111111111111111111111" as Address;

describe("persisted Squid acquisition", () => {
  it("persists, restores, owner-binds, and explicitly clears recovery state", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const processing = beginSquidAcquisition(storage, owner, 10n, 42161);
    expect(loadSquidAcquisition(storage, owner)).toEqual(processing);

    const sourceHash = `0x${"3".repeat(64)}` as const;
    const broadcast = markSquidBroadcast(storage, processing, sourceHash);
    const acquired = markSquidAcquired(storage, broadcast);
    expect(loadSquidAcquisition(storage, owner)).toEqual(acquired);
    expect(loadSquidAcquisition(storage, "0x2222222222222222222222222222222222222222")).toBeNull();

    const depositPreflight = markSquidDepositPending(storage, acquired);
    expect(loadSquidAcquisition(storage, owner)).toEqual(depositPreflight);

    const depositHash = `0x${"4".repeat(64)}` as const;
    const depositing = markSquidDepositPending(storage, depositPreflight, depositHash);
    expect(loadSquidAcquisition(storage, owner)).toEqual(depositing);

    clearSquidAcquisition(storage, owner);
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });
});
