import { type Address, type Hash, isAddress } from "viem";

const STORAGE_PREFIX = "filecoin-pay:squid-acquisition:v1";

type AcquisitionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SquidAcquisition = {
  depositTransactionHash?: Hash;
  destinationAmount: bigint;
  owner: Address;
  sourceChainId: number;
  status: "acquired" | "depositing" | "processing";
  transactionHashes: Hash[];
};

function storageKey(owner: Address) {
  return `${STORAGE_PREFIX}:${owner.toLowerCase()}`;
}

function save(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  storage.setItem(
    storageKey(acquisition.owner),
    JSON.stringify({ ...acquisition, destinationAmount: acquisition.destinationAmount.toString() }),
  );
  return acquisition;
}

export function loadSquidAcquisition(storage: AcquisitionStorage, expectedOwner: Address): SquidAcquisition | null {
  const value = storage.getItem(storageKey(expectedOwner));
  if (value === null) return null;

  try {
    const acquisition = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof acquisition.owner !== "string" ||
      !isAddress(acquisition.owner) ||
      acquisition.owner.toLowerCase() !== expectedOwner.toLowerCase() ||
      (acquisition.status !== "acquired" &&
        acquisition.status !== "depositing" &&
        acquisition.status !== "processing") ||
      typeof acquisition.sourceChainId !== "number" ||
      !Number.isSafeInteger(acquisition.sourceChainId) ||
      acquisition.sourceChainId <= 0 ||
      typeof acquisition.destinationAmount !== "string" ||
      !/^\d+$/.test(acquisition.destinationAmount) ||
      BigInt(acquisition.destinationAmount) <= 0n ||
      !Array.isArray(acquisition.transactionHashes) ||
      !acquisition.transactionHashes.every(isTransactionHash) ||
      (acquisition.depositTransactionHash !== undefined && !isTransactionHash(acquisition.depositTransactionHash))
    ) {
      return null;
    }
    return {
      destinationAmount: BigInt(acquisition.destinationAmount),
      depositTransactionHash: acquisition.depositTransactionHash as Hash | undefined,
      owner: acquisition.owner,
      sourceChainId: acquisition.sourceChainId,
      status: acquisition.status,
      transactionHashes: acquisition.transactionHashes as Hash[],
    };
  } catch {
    return null;
  }
}

export function beginSquidAcquisition(
  storage: AcquisitionStorage,
  owner: Address,
  destinationAmount: bigint,
  sourceChainId: number,
) {
  return save(storage, { destinationAmount, owner, sourceChainId, status: "processing", transactionHashes: [] });
}

export function markSquidBroadcast(storage: AcquisitionStorage, acquisition: SquidAcquisition, hash: Hash) {
  return save(storage, {
    ...acquisition,
    transactionHashes: acquisition.transactionHashes.includes(hash)
      ? acquisition.transactionHashes
      : [...acquisition.transactionHashes, hash],
  });
}

export function markSquidAcquired(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  const { depositTransactionHash: _, ...acquired } = acquisition;
  return save(storage, { ...acquired, status: "acquired" });
}

export function markSquidDepositPending(storage: AcquisitionStorage, acquisition: SquidAcquisition, hash?: Hash) {
  return save(storage, { ...acquisition, depositTransactionHash: hash, status: "depositing" });
}

export function clearSquidAcquisition(storage: AcquisitionStorage, owner: Address) {
  storage.removeItem(storageKey(owner));
}

function isTransactionHash(value: unknown): value is Hash {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
