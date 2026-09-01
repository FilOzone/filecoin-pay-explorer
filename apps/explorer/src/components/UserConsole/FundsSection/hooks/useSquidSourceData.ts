import { fetchSourceTokens, NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { type Address, erc20Abi } from "viem";
import { usePublicClient } from "wagmi";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import {
  hasUnknownSourceTokenBalances,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalancesQueryKey,
  visibleSourceTokens,
} from "../data/source-token-balances";
import { squidFetch } from "../data/squid-quote";

const isRateLimited = (error: unknown) => error instanceof Error && error.message.includes("(429)");

export type SquidExecutionInputs = {
  allowance?: bigint;
  nativeBalance: bigint;
  sourceBalance: bigint;
};

export function excludeDestinationUsdfc<T extends { token: string }>(tokens: readonly T[], sourceChainId: number) {
  return sourceChainId === mainnet.id
    ? tokens.filter((token) => token.token.toLowerCase() !== mainnet.contracts.usdfc.address.toLowerCase())
    : [...tokens];
}

export function useSquidSourceData({
  address,
  integratorId,
  showAllTokens,
  sourceChain,
  sourceTokenAddress,
}: {
  address?: Address;
  integratorId: string;
  showAllTokens: boolean;
  sourceChain: number;
  sourceTokenAddress: string;
}) {
  const sourcePublicClient = usePublicClient({ chainId: sourceChain || undefined });
  const tokenQuery = useQuery({
    enabled: integratorId !== "" && SQUID_SOURCE_CHAINS.some((chain) => chain.id === sourceChain),
    queryFn: () => fetchSourceTokens(sourceChain, { fetch: squidFetch, integratorId }),
    queryKey: ["squid", "source-tokens", sourceChain],
    retry: (failureCount, error) => isRateLimited(error) && failureCount < 2,
    retryDelay: (failureCount) => 15_000 * (failureCount + 1),
    staleTime: 300_000,
  });
  const tokens = tokenQuery.data ?? [];
  const selectableTokens = excludeDestinationUsdfc(tokens, sourceChain);
  const inventoryQuery = useQuery({
    enabled: !!address && !!sourcePublicClient && selectableTokens.length > 0,
    queryFn: () => {
      if (!address || !sourcePublicClient) throw new Error("Source network client is unavailable");
      return readSourceTokenBalances(sourcePublicClient, address, selectableTokens);
    },
    queryKey: sourceTokenBalancesQueryKey(
      address ?? "0x0000000000000000000000000000000000000000",
      sourceChain,
      selectableTokens,
    ),
    refetchOnWindowFocus: false,
    staleTime: 300_000,
  });
  const hasUnknownTokenBalances = inventoryQuery.data
    ? hasUnknownSourceTokenBalances(selectableTokens, inventoryQuery.data)
    : false;
  const canFilterWalletTokens = !!inventoryQuery.data && !hasUnknownTokenBalances && !inventoryQuery.isError;
  const canToggleWalletTokens =
    !!address && selectableTokens.length > 0 && !hasUnknownTokenBalances && !inventoryQuery.isError;
  const visibleTokens = visibleSourceTokens(
    selectableTokens,
    inventoryQuery.isError ? undefined : inventoryQuery.data,
    showAllTokens,
    sourceTokenAddress,
  );
  const source = selectableTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const isNativeSource = source?.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const readSelectedBalance = () => {
    if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
    return readSourceTokenBalance(sourcePublicClient, address, source);
  };
  const sourceBalanceQuery = useQuery({
    enabled: !!address && !!source && !!sourcePublicClient,
    queryFn: readSelectedBalance,
    queryKey: ["squid", "source-balance", sourceChain, sourceTokenAddress, address],
  });
  const nativeBalanceQuery = useQuery({
    enabled: !!address && !!source && !isNativeSource && !!sourcePublicClient,
    queryFn: async () => {
      if (!sourcePublicClient || !address) throw new Error("Source network client is unavailable");
      return sourcePublicClient.getBalance({ address });
    },
    queryKey: ["squid", "native-balance", sourceChain, address],
  });
  const allowanceQuery = useQuery({
    enabled: !!address && !!source && !isNativeSource && !!sourcePublicClient,
    queryFn: async () => {
      if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
      return sourcePublicClient.readContract({
        abi: erc20Abi,
        address: source.token,
        args: [address, SQUID_ROUTER_ADDRESS],
        functionName: "allowance",
      });
    },
    queryKey: ["squid", "source-allowance", sourceChain, sourceTokenAddress, address, SQUID_ROUTER_ADDRESS],
  });

  const refreshExecutionInputs = async (): Promise<SquidExecutionInputs> => {
    const sourceResult = await sourceBalanceQuery.refetch();
    if (sourceResult.isError || sourceResult.data === undefined) {
      throw new Error("Could not refresh your source-token balance. Try again before confirming.");
    }
    if (isNativeSource) {
      return { nativeBalance: sourceResult.data, sourceBalance: sourceResult.data };
    }
    const [nativeResult, allowanceResult] = await Promise.all([nativeBalanceQuery.refetch(), allowanceQuery.refetch()]);
    if (nativeResult.isError || nativeResult.data === undefined) {
      throw new Error("Could not refresh your source-network gas balance. Try again before confirming.");
    }
    if (allowanceResult.isError || allowanceResult.data === undefined) {
      throw new Error("Could not refresh your source-token allowance. Try again before confirming.");
    }
    return {
      allowance: allowanceResult.data,
      nativeBalance: nativeResult.data,
      sourceBalance: sourceResult.data,
    };
  };

  return {
    catalog: {
      canFilterWalletTokens,
      canToggleWalletTokens,
      hasUnknownBalances: hasUnknownTokenBalances,
      inventory: {
        balances: inventoryQuery.data,
        isInitialLoading: !!address && selectableTokens.length > 0 && inventoryQuery.isFetching && !inventoryQuery.data,
        retry: inventoryQuery.refetch,
        status: inventoryQuery.isError ? "error" : inventoryQuery.isFetching ? "loading" : "ready",
      },
      retry: tokenQuery.refetch,
      status: tokenQuery.isError && tokens.length === 0 ? "error" : tokenQuery.isFetching ? "loading" : "ready",
      tokenError: tokenQuery.error,
      tokens,
      visibleTokens,
    },
    networkFunds: {
      allowance:
        !source || isNativeSource
          ? ({ status: "not-required" } as const)
          : allowanceQuery.isError
            ? ({ retry: allowanceQuery.refetch, status: "error" } as const)
            : allowanceQuery.data === undefined
              ? ({ status: "loading" } as const)
              : ({ value: allowanceQuery.data, status: "ready" } as const),
      nativeBalance:
        !source || isNativeSource
          ? ({ status: "not-required" } as const)
          : nativeBalanceQuery.isError
            ? ({ retry: nativeBalanceQuery.refetch, status: "error" } as const)
            : nativeBalanceQuery.data === undefined
              ? ({ status: "loading" } as const)
              : ({ value: nativeBalanceQuery.data, status: "ready" } as const),
    },
    refreshExecutionInputs,
    selectedToken: {
      balance: sourceBalanceQuery.isError
        ? ({ isRefreshing: sourceBalanceQuery.isFetching, retry: sourceBalanceQuery.refetch, status: "error" } as const)
        : sourceBalanceQuery.data === undefined
          ? ({
              isRefreshing: sourceBalanceQuery.isFetching,
              retry: sourceBalanceQuery.refetch,
              status: "loading",
            } as const)
          : ({
              isRefreshing: sourceBalanceQuery.isFetching,
              retry: sourceBalanceQuery.refetch,
              status: "ready",
              value: sourceBalanceQuery.data,
            } as const),
      isNative: isNativeSource,
      token: source,
    },
  };
}
