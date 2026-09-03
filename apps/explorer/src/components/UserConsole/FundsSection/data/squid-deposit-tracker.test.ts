import type { Hash } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingSquidDeposit,
  getPendingSquidDepositKey,
  loadPendingSquidDeposit,
  PENDING_SQUID_DEPOSIT_EVENT,
  type PendingSquidDeposit,
  savePendingSquidDeposit,
  subscribeToPendingSquidDeposit,
} from "./squid-deposit-tracker";

const RECIPIENT = "0x2222222222222222222222222222222222222222";
const pending: PendingSquidDeposit = {
  recipient: RECIPIENT,
  owner: "0x1111111111111111111111111111111111111111",
  sourceChainId: 8453,
  quoteId: "quote-1",
  transactionHash: `0x${"b".repeat(64)}` as Hash,
  sourceAmount: 100_000_000n,
  minimumDestinationAmount: 92n * 10n ** 18n,
  fundsBefore: 5n,
  startedAt: 1_700_000_000_000,
};

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

describe("pending Squid deposit tracker", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a pending deposit keyed by the recipient", () => {
    savePendingSquidDeposit(storage, pending);
    expect(storage.items.has(getPendingSquidDepositKey(RECIPIENT))).toBe(true);
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toEqual(pending);
    clearPendingSquidDeposit(storage, RECIPIENT);
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toBeNull();
  });

  it("ignores entries that are corrupt or belong to another account", () => {
    storage.setItem(getPendingSquidDepositKey(RECIPIENT), "{not json");
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toBeNull();

    savePendingSquidDeposit(storage, { ...pending, transactionHash: "0x1234" as Hash });
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toBeNull();

    savePendingSquidDeposit(storage, pending);
    expect(loadPendingSquidDeposit(storage, "0x9999999999999999999999999999999999999999")).toBeNull();
  });

  it("keeps the paid token's symbol and decimals when they were recorded", () => {
    savePendingSquidDeposit(storage, { ...pending, sourceSymbol: "USDC", sourceDecimals: 6 });
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toEqual({
      ...pending,
      sourceSymbol: "USDC",
      sourceDecimals: 6,
    });

    const stored = JSON.parse(storage.getItem(getPendingSquidDepositKey(RECIPIENT)) ?? "{}") as Record<string, unknown>;
    storage.setItem(getPendingSquidDepositKey(RECIPIENT), JSON.stringify({ ...stored, sourceDecimals: "6" }));
    expect(loadPendingSquidDeposit(storage, RECIPIENT)).toBeNull();
  });

  it("announces saves and clears in this tab and relays changes from any tab", () => {
    const listeners: Record<string, (event?: unknown) => void> = {};
    const dispatchEvent = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, listener: (event?: unknown) => void) => {
        listeners[type] = listener;
      }),
      dispatchEvent,
      removeEventListener,
    });

    savePendingSquidDeposit(storage, pending);
    clearPendingSquidDeposit(storage, RECIPIENT);
    expect(dispatchEvent.mock.calls.map(([event]) => (event as Event).type)).toEqual([
      PENDING_SQUID_DEPOSIT_EVENT,
      PENDING_SQUID_DEPOSIT_EVENT,
    ]);

    const onChange = vi.fn();
    const unsubscribe = subscribeToPendingSquidDeposit(RECIPIENT, onChange);
    listeners.storage?.({ key: "unrelated" });
    expect(onChange).not.toHaveBeenCalled();
    listeners.storage?.({ key: getPendingSquidDepositKey(RECIPIENT) });
    listeners.storage?.({ key: null });
    listeners[PENDING_SQUID_DEPOSIT_EVENT]?.();
    expect(onChange).toHaveBeenCalledTimes(3);

    unsubscribe();
    expect(removeEventListener.mock.calls.map(([type]) => type)).toEqual(["storage", PENDING_SQUID_DEPOSIT_EVENT]);
  });
});
