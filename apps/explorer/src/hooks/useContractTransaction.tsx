import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Abi, Hex, TransactionReceipt } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import type { TransactionMetadata } from "@/types";
import { getToastContent } from "@/utils/toast";

interface UseContractTransactionOptions {
  contractAddress: Hex;
  abi: Abi;
  chainId?: number;
  explorerUrl?: string;
  onSuccess?: (receipt: TransactionReceipt) => void;
  onError?: (error: Error) => void;
}

interface ExecuteTransactionParams {
  functionName: string;
  args: unknown[];
  value?: bigint;
  metadata: TransactionMetadata;
  onSubmitOnChain?: () => void;
  /** Submission failure only (wallet rejection); receipt-level failures go to `onReverted`. */
  onError?: (error?: Error) => void;
  /** Fires when THIS transaction's receipt confirms — safe under concurrency. */
  onConfirmed?: (receipt: TransactionReceipt) => void;
  /** Fires when THIS transaction reverts or receipt-tracking fails. */
  onReverted?: (error: Error) => void;
}

/**
 * Submits contract writes and tracks EVERY submitted transaction to its
 * receipt independently. Each `execute` call owns its toast and callbacks
 * end to end — the previous implementation watched only the latest hash, so
 * a second in-flight transaction silently orphaned the first one's toast and
 * callbacks (its loading toast never resolved).
 */
export const useContractTransaction = (options: UseContractTransactionOptions) => {
  const { contractAddress, abi, explorerUrl, onSuccess, onError } = options;

  const [inFlightCount, setInFlightCount] = useState(0);
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const publicClient = usePublicClient();

  const explorerAction = (txHash: Hex) =>
    explorerUrl
      ? {
          label: (
            <span className='flex items-center gap-1'>
              {`${txHash.slice(0, 6)}...${txHash.slice(-4)}`}
              <ExternalLink className='h-3 w-3' />
            </span>
          ),
          onClick: () => window.open(`${explorerUrl}/tx/${txHash}`, "_blank"),
        }
      : undefined;

  const execute = async ({
    functionName,
    args,
    value,
    metadata,
    onSubmitOnChain,
    onError: onSubmitError,
    onConfirmed,
    onReverted,
  }: ExecuteTransactionParams) => {
    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName,
        args,
        value,
      });

      onSubmitOnChain?.();
      const content = getToastContent(metadata, "pending");
      const toastId = toast.loading(content.title, {
        description: content.description,
      });

      setInFlightCount((count) => count + 1);
      // Deliberately not awaited: `execute` resolves at submission (callers
      // rely on that), while this continuation follows the receipt.
      void (async () => {
        try {
          if (!publicClient) throw new Error("No public client for receipt tracking");
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status === "reverted") throw new Error(`Transaction ${txHash} reverted`);

          const success = getToastContent(metadata, "success");
          toast.success(success.title, {
            id: toastId,
            description: success.description,
            action: explorerAction(txHash),
          });
          onSuccess?.(receipt);
          onConfirmed?.(receipt);
        } catch (receiptError) {
          const failure = getToastContent(metadata, "error");
          console.error(`[Transaction Error] ${failure.title}:`, {
            error: receiptError instanceof Error ? receiptError.message : String(receiptError),
            txHash,
            metadata,
            fullError: receiptError,
          });
          toast.error(failure.title, {
            id: toastId,
            description: "Request failed. See console logs for more details.",
            action: explorerAction(txHash),
          });
          onError?.(receiptError as Error);
          onReverted?.(receiptError as Error);
        } finally {
          setInFlightCount((count) => count - 1);
        }
      })();

      return txHash;
    } catch (err) {
      console.error("[Transaction Rejected]:", {
        error: err instanceof Error ? err.message : "Transaction failed",
        metadata,
        fullError: err,
      });

      toast.error("Transaction Rejected", {
        description: "Request failed. See console logs for more details.",
        duration: 4000,
      });

      onSubmitError?.(err as Error);
      throw err;
    }
  };

  return {
    execute,
    isExecuting: isWritePending || inFlightCount > 0,
  };
};
