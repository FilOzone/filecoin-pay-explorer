import { type Address, type Hash, isAddress, isHash } from "viem";
import type { SquidDepositRef } from "./squid-deposit-route";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const STORAGE_PREFIX = "filecoin-pay:squid-deposit:v1";
/** Fired on `window` when a pending deposit is saved or cleared in this tab; `storage` events cover other tabs. */
export const PENDING_SQUID_DEPOSIT_EVENT = "filecoin-pay:squid-deposit-changed";

/** A broadcast Squid deposit route whose Filecoin Pay credit is still pending. */
export interface PendingSquidDeposit extends SquidDepositRef {
  recipient: Address;
  owner: Address;
  sourceToken: Address;
  sourceAmount: bigint;
  minimumDestinationAmount: bigint;
  fundsBefore: bigint;
  startedAt: number;
  /** Symbol and decimals of the token paid, so the console can name the amount while it is in flight. */
  sourceSymbol?: string;
  sourceDecimals?: number;
}

export function getPendingSquidDepositKey(owner: Address): string {
  return `${STORAGE_PREFIX}:${owner.toLowerCase()}`;
}

export function savePendingSquidDeposit(storage: StorageLike, pending: PendingSquidDeposit): PendingSquidDeposit {
  storage.setItem(
    getPendingSquidDepositKey(pending.owner),
    JSON.stringify({
      ...pending,
      sourceAmount: pending.sourceAmount.toString(),
      minimumDestinationAmount: pending.minimumDestinationAmount.toString(),
      fundsBefore: pending.fundsBefore.toString(),
    }),
  );
  announcePendingSquidDepositChange();
  return pending;
}

export function loadPendingSquidDeposit(
  storage: StorageLike,
  owner: Address,
  recipient: Address,
): PendingSquidDeposit | null {
  const value = storage.getItem(getPendingSquidDepositKey(owner));
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.recipient !== "string" ||
      !isAddress(parsed.recipient) ||
      parsed.recipient.toLowerCase() !== recipient.toLowerCase() ||
      typeof parsed.owner !== "string" ||
      !isAddress(parsed.owner) ||
      parsed.owner.toLowerCase() !== owner.toLowerCase() ||
      typeof parsed.sourceToken !== "string" ||
      !isAddress(parsed.sourceToken) ||
      typeof parsed.sourceChainId !== "number" ||
      !Number.isSafeInteger(parsed.sourceChainId) ||
      typeof parsed.quoteId !== "string" ||
      parsed.quoteId === "" ||
      typeof parsed.transactionHash !== "string" ||
      !isHash(parsed.transactionHash) ||
      !isDigits(parsed.sourceAmount) ||
      !isDigits(parsed.minimumDestinationAmount) ||
      !isDigits(parsed.fundsBefore) ||
      typeof parsed.startedAt !== "number" ||
      (parsed.sourceSymbol !== undefined && typeof parsed.sourceSymbol !== "string") ||
      (parsed.sourceDecimals !== undefined && !isDecimals(parsed.sourceDecimals))
    ) {
      return null;
    }
    return {
      recipient: parsed.recipient,
      owner: parsed.owner,
      sourceToken: parsed.sourceToken,
      sourceChainId: parsed.sourceChainId,
      quoteId: parsed.quoteId,
      transactionHash: parsed.transactionHash as Hash,
      sourceAmount: BigInt(parsed.sourceAmount),
      minimumDestinationAmount: BigInt(parsed.minimumDestinationAmount),
      fundsBefore: BigInt(parsed.fundsBefore),
      startedAt: parsed.startedAt,
      ...(typeof parsed.sourceSymbol === "string" ? { sourceSymbol: parsed.sourceSymbol } : {}),
      ...(typeof parsed.sourceDecimals === "number" ? { sourceDecimals: parsed.sourceDecimals } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPendingSquidDeposit(storage: StorageLike, owner: Address): void {
  storage.removeItem(getPendingSquidDepositKey(owner));
  announcePendingSquidDepositChange();
}

/** Calls `onChange` whenever this recipient's pending deposit may have changed, in this tab or another. */
export function subscribeToPendingSquidDeposit(owner: Address, onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => undefined;
  const key = getPendingSquidDepositKey(owner);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(PENDING_SQUID_DEPOSIT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PENDING_SQUID_DEPOSIT_EVENT, onChange);
  };
}

function announcePendingSquidDepositChange(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event(PENDING_SQUID_DEPOSIT_EVENT));
}

function isDigits(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isDecimals(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36;
}
