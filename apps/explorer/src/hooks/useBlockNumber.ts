import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "@/services/viem/client";
import useNetwork from "./useNetwork";

interface UseBlockNumberOptions {
  refetchInterval?: number | false;
}

/**
 * Custom hook to fetch the current block number using viem's public client.
 *
 * @returns Query result containing the current block number
 *
 * @example
 * ```tsx
 * const { data: blockNumber, isLoading } = useBlockNumber();
 * ```
 */
export function useBlockNumber(options?: UseBlockNumberOptions) {
  const { network } = useNetwork();

  return useQuery({
    queryKey: ["blockNumber", network],
    queryFn: async () => {
      const publicClient = getPublicClient(network);
      const blockNumber = await publicClient.getBlockNumber();
      return blockNumber;
    },
    refetchInterval: options?.refetchInterval || false,
    placeholderData: (previousData) => previousData,
  });
}
