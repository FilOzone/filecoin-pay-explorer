import { type Address, type Hash, isAddress } from "viem";

const STORAGE_PREFIX = "filecoin-pay:squid-acquisition:v1";

type AcquisitionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SquidAcquisition = {
  acquisitionId?: string;
  completedRequirementIds?: string[];
  depositTransactionHash?: Hash;
  deliveredAmount?: bigint;
  destinationBalanceBefore?: bigint;
  destinationAmount: bigint;
  executionStage?: SquidAcquisitionExecutionStage;
  owner: Address;
  sourceChainId: number;
  status: "acquired" | "depositing" | "processing";
  transactionHashes: Hash[];
};

export type SquidAcquisitionExecutionStage = "preparing" | "swap-broadcast" | "swap-requested";

export function getSquidAcquisitionStorageKey(owner: Address) {
  return `${STORAGE_PREFIX}:${owner.toLowerCase()}`;
}

export function hasSavedSquidAcquisition(storage: AcquisitionStorage, owner: Address) {
  return storage.getItem(getSquidAcquisitionStorageKey(owner)) !== null;
}

function save(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  storage.setItem(
    getSquidAcquisitionStorageKey(acquisition.owner),
    JSON.stringify({
      ...acquisition,
      deliveredAmount: acquisition.deliveredAmount?.toString(),
      destinationAmount: acquisition.destinationAmount.toString(),
      destinationBalanceBefore: acquisition.destinationBalanceBefore?.toString(),
    }),
  );
  return acquisition;
}

export function loadSquidAcquisition(storage: AcquisitionStorage, expectedOwner: Address): SquidAcquisition | null {
  const value = storage.getItem(getSquidAcquisitionStorageKey(expectedOwner));
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
      (acquisition.acquisitionId !== undefined &&
        (typeof acquisition.acquisitionId !== "string" || !/^[0-9a-f-]{36}$/i.test(acquisition.acquisitionId))) ||
      (acquisition.completedRequirementIds !== undefined &&
        (!Array.isArray(acquisition.completedRequirementIds) ||
          !acquisition.completedRequirementIds.every((id) => typeof id === "string" && id.length > 0) ||
          new Set(acquisition.completedRequirementIds).size !== acquisition.completedRequirementIds.length)) ||
      typeof acquisition.sourceChainId !== "number" ||
      !Number.isSafeInteger(acquisition.sourceChainId) ||
      acquisition.sourceChainId <= 0 ||
      typeof acquisition.destinationAmount !== "string" ||
      !/^\d+$/.test(acquisition.destinationAmount) ||
      BigInt(acquisition.destinationAmount) <= 0n ||
      (acquisition.destinationBalanceBefore !== undefined &&
        (typeof acquisition.destinationBalanceBefore !== "string" ||
          !/^\d+$/.test(acquisition.destinationBalanceBefore))) ||
      (acquisition.deliveredAmount !== undefined &&
        (typeof acquisition.deliveredAmount !== "string" ||
          !/^\d+$/.test(acquisition.deliveredAmount) ||
          BigInt(acquisition.deliveredAmount) < BigInt(acquisition.destinationAmount) ||
          acquisition.status === "processing")) ||
      (acquisition.destinationBalanceBefore !== undefined &&
        acquisition.status !== "processing" &&
        acquisition.deliveredAmount === undefined) ||
      !Array.isArray(acquisition.transactionHashes) ||
      !acquisition.transactionHashes.every(isTransactionHash) ||
      (Array.isArray(acquisition.completedRequirementIds) &&
        acquisition.completedRequirementIds.length > 0 &&
        acquisition.transactionHashes.length === 0) ||
      (acquisition.depositTransactionHash !== undefined &&
        (!isTransactionHash(acquisition.depositTransactionHash) || acquisition.status !== "depositing"))
    ) {
      return null;
    }
    const executionStage =
      acquisition.status !== "processing"
        ? (acquisition.executionStage as SquidAcquisitionExecutionStage | undefined)
        : acquisition.executionStage === undefined
          ? acquisition.transactionHashes.length > 0
            ? "swap-broadcast"
            : "swap-requested"
          : acquisition.executionStage;
    if (
      executionStage !== undefined &&
      executionStage !== "preparing" &&
      executionStage !== "swap-requested" &&
      executionStage !== "swap-broadcast"
    ) {
      return null;
    }
    if (
      acquisition.status === "processing" &&
      (executionStage === undefined ||
        (executionStage === "preparing" &&
          acquisition.transactionHashes.length > 0 &&
          (!Array.isArray(acquisition.completedRequirementIds) || acquisition.completedRequirementIds.length === 0)) ||
        (executionStage === "swap-broadcast" && acquisition.transactionHashes.length === 0))
    ) {
      return null;
    }
    return {
      acquisitionId: acquisition.acquisitionId as string | undefined,
      completedRequirementIds: acquisition.completedRequirementIds as string[] | undefined,
      deliveredAmount: acquisition.deliveredAmount === undefined ? undefined : BigInt(acquisition.deliveredAmount),
      destinationBalanceBefore:
        acquisition.destinationBalanceBefore === undefined ? undefined : BigInt(acquisition.destinationBalanceBefore),
      destinationAmount: BigInt(acquisition.destinationAmount),
      depositTransactionHash: acquisition.depositTransactionHash as Hash | undefined,
      executionStage,
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
  destinationBalanceBefore: bigint,
  sourceChainId: number,
  acquisitionId = globalThis.crypto.randomUUID(),
) {
  if (storage.getItem(getSquidAcquisitionStorageKey(owner)) !== null)
    throw new Error("A saved Squid acquisition already exists");
  return save(storage, {
    acquisitionId,
    destinationAmount,
    destinationBalanceBefore,
    executionStage: "preparing",
    owner,
    sourceChainId,
    status: "processing",
    transactionHashes: [],
  });
}

export function markSquidSwapRequested(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  const current = requireCurrent(storage, acquisition);
  if (current.status !== "processing" || !hasSameSquidAcquisitionSnapshot(current, acquisition)) {
    throw new Error("Saved Squid acquisition changed");
  }
  return save(storage, { ...current, executionStage: "swap-requested" });
}

export function getDeliveredSquidAmount(acquisition: SquidAcquisition, currentDestinationBalance: bigint) {
  if (
    acquisition.destinationBalanceBefore === undefined ||
    currentDestinationBalance < acquisition.destinationBalanceBefore
  ) {
    return null;
  }
  const deliveredAmount = currentDestinationBalance - acquisition.destinationBalanceBefore;
  return deliveredAmount >= acquisition.destinationAmount ? deliveredAmount : null;
}

export function markSquidAcquiredFromBalance(
  storage: AcquisitionStorage,
  acquisition: SquidAcquisition,
  currentDestinationBalance: bigint,
) {
  const deliveredAmount = getDeliveredSquidAmount(acquisition, currentDestinationBalance);
  if (deliveredAmount === null) throw new Error("The reviewed USDFC minimum has not arrived yet");
  return markSquidAcquired(storage, acquisition, deliveredAmount);
}

export function markSquidBroadcast(storage: AcquisitionStorage, acquisition: SquidAcquisition, hash: Hash) {
  const current = requireCurrent(storage, acquisition);
  if (current.status !== "processing") throw new Error("Squid acquisition is no longer processing");
  if (current.executionStage === "swap-broadcast" && current.transactionHashes.includes(hash)) return current;
  if (current.executionStage !== "swap-requested" || !hasSameSquidAcquisitionSnapshot(current, acquisition)) {
    throw new Error("Saved Squid acquisition changed");
  }
  return save(storage, {
    ...current,
    executionStage: "swap-broadcast",
    transactionHashes: current.transactionHashes.includes(hash)
      ? current.transactionHashes
      : [...current.transactionHashes, hash],
  });
}

export function markSquidIntermediateRouteCompleted(
  storage: AcquisitionStorage,
  acquisition: SquidAcquisition,
  requirementId: string,
) {
  const current = requireCurrent(storage, acquisition);
  if (
    current.status !== "processing" ||
    current.executionStage !== "swap-broadcast" ||
    current.transactionHashes.length === 0 ||
    !hasSameSquidAcquisitionSnapshot(current, acquisition)
  ) {
    throw new Error("Saved Squid acquisition changed");
  }
  return save(storage, {
    ...current,
    completedRequirementIds: [...(current.completedRequirementIds ?? []), requirementId],
    executionStage: "preparing",
  });
}

export function resetSquidRouteAttempt(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  const current = requireCurrent(storage, acquisition);
  if (
    current.status !== "processing" ||
    current.executionStage !== "swap-requested" ||
    !hasSameSquidAcquisitionSnapshot(current, acquisition)
  ) {
    throw new Error("Saved Squid acquisition changed");
  }
  return save(storage, { ...current, executionStage: "preparing" });
}

export function markSquidAcquired(
  storage: AcquisitionStorage,
  acquisition: SquidAcquisition,
  deliveredAmount?: bigint,
) {
  const current = requireCurrent(storage, acquisition);
  if (current.status === "acquired") return current;
  if (current.status !== "processing") throw new Error("Squid acquisition is no longer processing");
  if (!hasSameSquidAcquisitionSnapshot(current, acquisition)) {
    throw new Error("Saved Squid acquisition changed");
  }
  if (deliveredAmount !== undefined && deliveredAmount < current.destinationAmount) {
    throw new Error("Delivered USDFC is below the reviewed minimum");
  }
  if (current.destinationBalanceBefore !== undefined && deliveredAmount === undefined) {
    throw new Error("Delivered USDFC must be verified for this acquisition");
  }
  return save(storage, { ...current, deliveredAmount, status: "acquired" });
}

export function markSquidDepositPending(storage: AcquisitionStorage, acquisition: SquidAcquisition, hash?: Hash) {
  const current = requireCurrent(storage, acquisition);
  if (current.status !== acquisition.status) throw new Error("Saved Squid acquisition changed");
  if (current.status !== "acquired" && current.status !== "depositing") {
    throw new Error("Squid acquisition is not ready to deposit");
  }
  if (current.depositTransactionHash !== undefined && hash !== undefined && current.depositTransactionHash !== hash) {
    throw new Error("A different Filecoin deposit is already pending");
  }
  return save(storage, {
    ...current,
    depositTransactionHash: hash ?? current.depositTransactionHash,
    status: "depositing",
  });
}

export function resetSquidDeposit(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  const current = requireCurrent(storage, acquisition);
  if (current.status !== "depositing" || !isSameState(current, acquisition)) {
    throw new Error("Squid deposit is not the expected pending transaction");
  }
  const { depositTransactionHash: _, ...acquired } = current;
  return save(storage, { ...acquired, status: "acquired" });
}

export function getSquidDepositAmount(acquisition: SquidAcquisition) {
  return acquisition.deliveredAmount ?? acquisition.destinationAmount;
}

export function clearSquidAcquisition(storage: AcquisitionStorage, acquisition: SquidAcquisition) {
  const current = requireCurrent(storage, acquisition);
  if (!isSameState(current, acquisition)) throw new Error("Saved Squid acquisition changed");
  storage.removeItem(getSquidAcquisitionStorageKey(current.owner));
}

export function clearInvalidSquidAcquisition(storage: AcquisitionStorage, owner: Address) {
  if (!hasSavedSquidAcquisition(storage, owner)) return;
  if (loadSquidAcquisition(storage, owner) !== null) throw new Error("The saved Squid acquisition is valid");
  storage.removeItem(getSquidAcquisitionStorageKey(owner));
}

function isTransactionHash(value: unknown): value is Hash {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function requireCurrent(storage: AcquisitionStorage, expected: SquidAcquisition) {
  const current = loadSquidAcquisition(storage, expected.owner);
  if (!current || !isSameAcquisition(current, expected)) throw new Error("Saved Squid acquisition changed");
  return current;
}

function isSameAcquisition(current: SquidAcquisition, expected: SquidAcquisition) {
  if (current.acquisitionId !== undefined || expected.acquisitionId !== undefined) {
    return current.acquisitionId !== undefined && current.acquisitionId === expected.acquisitionId;
  }
  return (
    current.owner.toLowerCase() === expected.owner.toLowerCase() &&
    current.sourceChainId === expected.sourceChainId &&
    current.destinationAmount === expected.destinationAmount &&
    current.destinationBalanceBefore === expected.destinationBalanceBefore
  );
}

function isSameState(current: SquidAcquisition, expected: SquidAcquisition) {
  return hasSameSquidAcquisitionSnapshot(current, expected);
}

export function hasSameSquidAcquisitionSnapshot(current: SquidAcquisition, expected: SquidAcquisition) {
  return (
    current.acquisitionId === expected.acquisitionId &&
    (current.completedRequirementIds ?? []).length === (expected.completedRequirementIds ?? []).length &&
    (current.completedRequirementIds ?? []).every((id, index) => id === expected.completedRequirementIds?.[index]) &&
    current.owner.toLowerCase() === expected.owner.toLowerCase() &&
    current.sourceChainId === expected.sourceChainId &&
    current.destinationAmount === expected.destinationAmount &&
    current.destinationBalanceBefore === expected.destinationBalanceBefore &&
    current.executionStage === expected.executionStage &&
    current.status === expected.status &&
    current.depositTransactionHash === expected.depositTransactionHash &&
    current.deliveredAmount === expected.deliveredAmount &&
    current.transactionHashes.length === expected.transactionHashes.length &&
    current.transactionHashes.every((hash, index) => hash === expected.transactionHashes[index])
  );
}
