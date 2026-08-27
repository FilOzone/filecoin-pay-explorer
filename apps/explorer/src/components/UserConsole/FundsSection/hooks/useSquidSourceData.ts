import { fetchSourceTokens, NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { type Address, erc20Abi } from "viem";
import { usePublicClient } from "wagmi";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import {
  hasUnknownSourceTokenBalances,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalance,
  sourceTokenBalancesQueryKey,
  visibleSourceTokens,
} from "../data/source-token-balances";
import { squidFetch } from "../data/squid-quote";

const isRateLimited = (error: unknown) => error instanceof Error && error.message.includes("(429)");

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
  });
  const hasUnknownTokenBalances = inventoryQuery.data
    ? hasUnknownSourceTokenBalances(selectableTokens, inventoryQuery.data)
    : false;
  const canFilterWalletTokens = !!inventoryQuery.data && !hasUnknownTokenBalances && !inventoryQuery.isError;
  const visibleTokens = visibleSourceTokens(
    selectableTokens,
    inventoryQuery.isError ? undefined : inventoryQuery.data,
    showAllTokens,
    sourceTokenAddress,
  );
  const source = selectableTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const inventoriedSourceBalance = source ? sourceTokenBalance(inventoryQuery.data, source.token) : undefined;
  const hasInventoriedSourceBalance = typeof inventoriedSourceBalance === "bigint";
  const isNativeSource = source?.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const readSelectedBalance = () => {
    if (!sourcePublicClient || !address || !source) throw new Error("Source network client is unavailable");
    return readSourceTokenBalance(sourcePublicClient, address, source);
  };
  const sourceBalanceQuery = useQuery({
    enabled: !!address && !!source && !!sourcePublicClient && !hasInventoriedSourceBalance,
    queryFn: readSelectedBalance,
    queryKey: ["squid", "source-balance", sourceChain, sourceTokenAddress, address],
  });
  const sourceBalance = hasInventoriedSourceBalance ? inventoriedSourceBalance : sourceBalanceQuery.data;
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

  const refetchSelectedBalance = async () => {
    if (!source) return { data: undefined, isError: true };
    try {
      return { data: await readSelectedBalance(), isError: false };
    } catch {
      return { data: undefined, isError: true };
    }
  };

  const retryAllowance = async () => {
    const result = await allowanceQuery.refetch();
    return { data: result.data, isError: result.isError };
  };
  const retryNativeBalance = async () => {
    const result = await nativeBalanceQuery.refetch();
    return { data: result.data, isError: result.isError };
  };

  return {
    allowance: allowanceQuery.data,
    allowanceError: allowanceQuery.error,
    canFilterWalletTokens,
    hasUnknownTokenBalances,
    isAllowanceLoading: allowanceQuery.isFetching,
    isNativeSource,
    isNativeBalanceLoading: nativeBalanceQuery.isFetching,
    isSourceBalanceLoading: !hasInventoriedSourceBalance && sourceBalanceQuery.isFetching,
    isTokenInventoryLoading: inventoryQuery.isFetching,
    isTokenLoading: tokenQuery.isFetching,
    isWalletTokenInventoryLoading:
      !!address && selectableTokens.length > 0 && inventoryQuery.isFetching && !inventoryQuery.data,
    nativeBalance: isNativeSource ? sourceBalance : nativeBalanceQuery.data,
    nativeBalanceError: nativeBalanceQuery.error,
    refetchSelectedBalance,
    retryAllowance,
    retryNativeBalance,
    retrySourceBalance: sourceBalanceQuery.refetch,
    retryTokenInventory: inventoryQuery.refetch,
    retryTokens: tokenQuery.refetch,
    source,
    sourceBalance,
    sourceBalanceError: hasInventoriedSourceBalance ? null : sourceBalanceQuery.error,
    sourceTokenBalances: inventoryQuery.data,
    tokenInventoryError: inventoryQuery.error,
    tokenLoadError: tokenQuery.error,
    tokens,
    visibleTokens,
  };
}
