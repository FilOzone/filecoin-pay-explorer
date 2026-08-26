import { SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { type Address, type Hash, TransactionReceiptNotFoundError } from "viem";
import { getDeliveredSquidAmount, type SquidAcquisition } from "./squid-acquisition";

export type SquidRecoveryCandidate = SquidAcquisition & {
  acquisitionId: string;
  destinationBalanceBefore: bigint;
  executionStage: "swap-broadcast";
  status: "processing";
};

type SquidRouteReceipt = {
  from: Address;
  status: "reverted" | "success";
  to: Address | null;
  transactionHash: Hash;
};

export class SquidRecoveryTrustError extends Error {
  override name = "SquidRecoveryTrustError";
}

export function isAutomaticSquidRecoveryCandidate(
  acquisition: SquidAcquisition | null,
): acquisition is SquidRecoveryCandidate {
  return (
    acquisition?.status === "processing" &&
    acquisition.executionStage === "swap-broadcast" &&
    acquisition.acquisitionId !== undefined &&
    acquisition.destinationBalanceBefore !== undefined &&
    acquisition.transactionHashes.length > 0
  );
}

export async function checkAutomaticSquidRecovery({
  acquisition,
  getSourceReceipt,
  readDestinationBalance,
}: {
  acquisition: SquidRecoveryCandidate;
  getSourceReceipt: (hash: Hash) => Promise<SquidRouteReceipt>;
  readDestinationBalance: () => Promise<bigint>;
}): Promise<bigint | null> {
  for (const hash of acquisition.transactionHashes) {
    let receipt: SquidRouteReceipt;
    try {
      receipt = await getSourceReceipt(hash);
    } catch (error) {
      if (
        error instanceof TransactionReceiptNotFoundError ||
        (error instanceof Error && error.name === "TransactionReceiptNotFoundError")
      ) {
        return null;
      }
      throw error;
    }
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
      throw new SquidRecoveryTrustError("Source transaction receipt hash does not match the saved Squid transaction");
    }
    if (receipt.status !== "success") throw new SquidRecoveryTrustError("A saved Squid source transaction reverted");
    if (receipt.from.toLowerCase() !== acquisition.owner.toLowerCase()) {
      throw new SquidRecoveryTrustError("A saved Squid source transaction was sent by a different account");
    }
    if (receipt.to?.toLowerCase() !== SQUID_ROUTER_ADDRESS.toLowerCase()) {
      throw new SquidRecoveryTrustError("A saved Squid source transaction did not target the trusted router");
    }
  }

  return getDeliveredSquidAmount(acquisition, await readDestinationBalance());
}
