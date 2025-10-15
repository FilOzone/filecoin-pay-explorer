import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Abi, Hex, TransactionReceipt } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
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
  onError?: (error?: Error) => void;
}

export const useContractTransaction = (options: UseContractTransactionOptions) => {
  const { contractAddress, abi, explorerUrl, onSuccess, onError } = options;

  const [transactions, setTransactions] = useState<
    Map<Hex, { toastId: string | number; metadata: TransactionMetadata }>
  >(new Map());
  const [currentTxHash, setCurrentTxHash] = useState<Hex | undefined>();

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const {
    data: receipt,
    isSuccess,
    isError,
    error,
  } = useWaitForTransactionReceipt({
    hash: currentTxHash,
    query: {
      enabled: !!currentTxHash,
    },
  });

  useEffect(() => {
    if (!currentTxHash) return;

    const txData = transactions.get(currentTxHash);
    if (!txData) return;

    if (isSuccess && receipt) {
      const content = getToastContent(txData.metadata, "success");
      const txHashShort = `${currentTxHash.slice(0, 6)}...${currentTxHash.slice(-4)}`;

      toast.success(content.title, {
        id: txData.toastId,
        description: content.description,
        action: explorerUrl
          ? {
              label: (
                <span className='flex items-center gap-1'>
                  {txHashShort}
                  <ExternalLink className='h-3 w-3' />
                </span>
              ),
              onClick: () => window.open(`${explorerUrl}/tx/${currentTxHash}`, "_blank"),
            }
          : undefined,
      });

      onSuccess?.(receipt);

      setTimeout(() => {
        setTransactions((prev) => {
          const next = new Map(prev);
          next.delete(currentTxHash);
          return next;
        });
        setCurrentTxHash(undefined);
      }, 5000);
    } else if (isError && error) {
      const content = getToastContent(txData.metadata, "error");
      const txHashShort = `${currentTxHash.slice(0, 6)}...${currentTxHash.slice(-4)}`;

      console.error(`[Transaction Error] ${content.title}:`, {
        error: error.message,
        txHash: currentTxHash,
        metadata: txData.metadata,
        fullError: error,
      });

      toast.error(content.title, {
        id: txData.toastId,
        description: "Request failed. See console logs for more details.",
        action: explorerUrl
          ? {
              label: (
                <span className='flex items-center gap-1'>
                  {txHashShort}
                  <ExternalLink className='h-3 w-3' />
                </span>
              ),
              onClick: () => window.open(`${explorerUrl}/tx/${currentTxHash}`, "_blank"),
            }
          : undefined,
      });

      onError?.(error as Error);
      setTimeout(() => {
        setTransactions((prev) => {
          const next = new Map(prev);
          next.delete(currentTxHash);
          return next;
        });
        setCurrentTxHash(undefined);
      }, 7000);
    }
  }, [currentTxHash, isSuccess, isError, receipt, error, transactions, explorerUrl, onSuccess, onError]);

  const execute = async ({
    functionName,
    args,
    value,
    metadata,
    onSubmitOnChain,
    onError,
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

      setTransactions((prev) => new Map(prev).set(txHash, { toastId, metadata }));
      setCurrentTxHash(txHash);

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

      onError?.(err as Error);
      throw err;
    }
  };

  return {
    execute,
    isExecuting: isWritePending || (!!currentTxHash && !isSuccess && !isError),
    currentTxHash,
    hasPendingTransactions: transactions.size > 0,
  };
};
