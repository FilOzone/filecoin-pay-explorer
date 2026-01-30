import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Abi, Hex, TransactionReceipt } from "viem";
import { useBlockNumber, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { TransactionMetadata } from "@/types";
import { formatToken } from "@/utils/formatter";
import { getToastContent } from "@/utils/toast";

interface RailSettlementState {
  railId: string;
  txHash?: Hex;
  toastId?: string | number;
  metadata: TransactionMetadata;
}

interface UseRailSettlementsOptions {
  contractAddress: Hex;
  abi: Abi;
  explorerUrl?: string;
  onSettlementSuccess?: (railId: string, receipt: TransactionReceipt) => void;
  onSettlementError?: (railId: string, error: Error) => void;
}

export interface SettleRailParams {
  railId: bigint;
  paymentRate: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  settledUpto: bigint;
}

export const useRailSettlements = (options: UseRailSettlementsOptions) => {
  const { contractAddress, abi, explorerUrl, onSettlementSuccess, onSettlementError } = options;

  const [settlements, setSettlements] = useState<Map<string, RailSettlementState>>(new Map());
  const [pendingTxHashes, setPendingTxHashes] = useState<Set<Hex>>(new Set());

  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { writeContractAsync } = useWriteContract();

  // Watch for any pending transaction
  const currentPendingTx = Array.from(pendingTxHashes)[0];
  const {
    data: receipt,
    isSuccess,
    isError,
    error,
  } = useWaitForTransactionReceipt({
    hash: currentPendingTx,
    query: {
      enabled: !!currentPendingTx,
    },
  });

  // Use ref for transient settlement values to avoid recreating callback
  const settlementsRef = useRef(settlements);
  settlementsRef.current = settlements;

  // Handle transaction completion
  const handleTransactionComplete = useCallback(
    (txHash: Hex, success: boolean, receiptData?: TransactionReceipt, errorData?: Error) => {
      const settlement = Array.from(settlementsRef.current.values()).find((s) => s.txHash === txHash);
      if (!settlement) return;

      if (success && receiptData) {
        const content = getToastContent(settlement.metadata, "success");
        const txHashShort = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;

        toast.success(content.title, {
          id: settlement.toastId,
          description: content.description,
          action: explorerUrl
            ? {
                label: `View ${txHashShort}`,
                onClick: () => window.open(`${explorerUrl}/tx/${txHash}`, "_blank"),
              }
            : undefined,
        });

        onSettlementSuccess?.(settlement.railId, receiptData);
      } else if (errorData) {
        const content = getToastContent(settlement.metadata, "error");

        console.error(`[Settlement Error] Rail ${settlement.railId}:`, {
          error: errorData.message,
          txHash,
          fullError: errorData,
        });

        toast.error(content.title, {
          id: settlement.toastId,
          description: "Settlement failed. See console for details.",
        });

        onSettlementError?.(settlement.railId, errorData);
      }

      // Cleanup
      setTimeout(() => {
        setSettlements((prev) => {
          const next = new Map(prev);
          next.delete(settlement.railId);
          return next;
        });
        setPendingTxHashes((prev) => {
          const next = new Set(prev);
          next.delete(txHash);
          return next;
        });
      }, 3000);
    },
    [explorerUrl, onSettlementSuccess, onSettlementError],
  );

  // Effect to handle transaction status changes
  useEffect(() => {
    if (currentPendingTx && (isSuccess || isError)) {
      handleTransactionComplete(currentPendingTx, isSuccess, receipt, error as Error);
    }
  }, [currentPendingTx, isSuccess, isError, receipt, error, handleTransactionComplete]);

  const settleRail = useCallback(
    async (params: SettleRailParams) => {
      const { railId, paymentRate, tokenSymbol, tokenDecimals, settledUpto } = params;
      const railIdStr = railId.toString();

      if (!blockNumber) {
        toast.error("Unable to settle", {
          description: "Failed to fetch current block number. Please try again.",
        });
        return;
      }

      const currentEpoch = BigInt(blockNumber);
      const epochsSinceLastSettlement = currentEpoch > settledUpto ? currentEpoch - settledUpto : 0n;
      const expectedAmount = paymentRate * epochsSinceLastSettlement;

      const metadata: TransactionMetadata = {
        type: "settleRail",
        railId: railIdStr,
        amount: formatToken(expectedAmount, tokenDecimals),
        token: tokenSymbol,
      };

      try {
        const content = getToastContent(metadata, "pending");
        const toastId = toast.loading(content.title, {
          description: content.description,
        });

        setSettlements((prev) =>
          new Map(prev).set(railIdStr, {
            railId: railIdStr,
            metadata,
            toastId,
          }),
        );

        const txHash = await writeContractAsync({
          address: contractAddress,
          abi,
          functionName: "settleRail",
          args: [railId, blockNumber],
        });

        setSettlements((prev) => {
          const existing = prev.get(railIdStr);
          if (existing) {
            return new Map(prev).set(railIdStr, {
              ...existing,
              txHash,
            });
          }
          return prev;
        });

        setPendingTxHashes((prev) => new Set(prev).add(txHash));

        return txHash;
      } catch (err) {
        console.error("[Settlement Rejected]:", {
          error: err instanceof Error ? err.message : "Transaction failed",
          railId: railIdStr,
          fullError: err,
        });

        // Get the settlement to access toastId
        const settlement = settlements.get(railIdStr);

        // Dismiss the loading toast and show error
        toast.dismiss(settlement?.toastId);
        toast.error("Settlement Rejected", {
          id: settlement?.toastId,
          description: "Transaction was rejected. Please try again.",
          duration: 4000,
        });

        // Clean up settlement state
        setSettlements((prev) => {
          const next = new Map(prev);
          next.delete(railIdStr);
          return next;
        });

        throw err;
      }
    },
    [blockNumber, contractAddress, abi, writeContractAsync, settlements],
  );

  const isSettling = useCallback(
    (railId: string) => {
      return settlements.has(railId);
    },
    [settlements],
  );

  const getSettlementCount = useCallback(() => {
    return settlements.size;
  }, [settlements]);

  return {
    settleRail,
    isSettling,
    getSettlementCount,
    activeSettlements: Array.from(settlements.keys()),
    settlements,
  };
};
