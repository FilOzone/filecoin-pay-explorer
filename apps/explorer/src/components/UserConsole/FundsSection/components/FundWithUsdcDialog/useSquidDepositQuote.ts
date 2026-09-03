import type { ConnectedWallet } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { type Address, erc20Abi, formatUnits, getAddress } from "viem";
import type { usePublicClient } from "wagmi";
import { parseFundingAmount } from "../../data/funding-runway";
import {
  getDepositRequiredNativeBalance,
  getUsdfcPerUsdc,
  planFilGasTopUp,
  requestSquidDepositRoute,
  type SquidClient,
  type SquidDepositTarget,
} from "../../data/squid-deposit-route";
import { usdcTokensQueryOptions } from "../../data/squid-usdc-tokens";

// Gas units for the USDC approval that precedes a first purchase, priced at the current gas price.
const APPROVAL_GAS_UNITS = 60_000n;
const MINIMUM_GAS_TOP_UP = 0.002;

export type DepositContracts = Pick<SquidDepositTarget, "payments" | "usdfc">;

/**
 * Everything the dialog needs to know before the user confirms: the USDC
 * tokens Squid accepts on the source network, the paying wallet's balances,
 * and a quote for the typed amount, with the shortfalls derived from them.
 */
export function useSquidDepositQuote({
  amount,
  depositTarget,
  isQuoting,
  open,
  payingWallet,
  recipient,
  sourceChainId,
  sourceClient,
  sourceTokenAddress,
  squid,
}: {
  /** The typed amount, already debounced. */
  amount: string;
  depositTarget: DepositContracts;
  /** False while a deposit is executing, which freezes the quote. */
  isQuoting: boolean;
  open: boolean;
  payingWallet: ConnectedWallet | undefined;
  recipient: Address | undefined;
  sourceChainId: number;
  sourceClient: ReturnType<typeof usePublicClient>;
  sourceTokenAddress: string;
  squid: SquidClient;
}) {
  const tokensQuery = useQuery({ ...usdcTokensQueryOptions(sourceChainId, squid), enabled: open });
  const usdcTokens = tokensQuery.data ?? [];
  const sourceToken =
    usdcTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase()) ?? usdcTokens[0];

  const balancesQuery = useQuery({
    enabled: open && !!sourceClient && !!payingWallet && !!sourceToken,
    queryFn: async () => {
      if (!sourceClient || !payingWallet || !sourceToken) throw new Error("Balances are unavailable");
      const owner = getAddress(payingWallet.address);
      const [token, native, gasPrice] = await Promise.all([
        sourceClient.readContract({
          abi: erc20Abi,
          address: sourceToken.token,
          args: [owner],
          functionName: "balanceOf",
        }),
        sourceClient.getBalance({ address: owner }),
        sourceClient.getGasPrice(),
      ]);
      return { token, native, gasPrice };
    },
    queryKey: ["squid-deposit-balances", sourceChainId, sourceToken?.token, payingWallet?.address],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const balances = balancesQuery.data;

  const parsedAmount = sourceToken ? parseFundingAmount(amount, sourceToken.decimals) : null;
  const hasInsufficientUsdc = balances !== undefined && parsedAmount !== null && balances.token < parsedAmount;
  // No quote for an amount the wallet cannot pay: the shortfall is the answer then.
  const quoteQuery = useQuery({
    enabled:
      open &&
      isQuoting &&
      !!payingWallet &&
      !!sourceToken &&
      !!recipient &&
      parsedAmount !== null &&
      !hasInsufficientUsdc,
    queryFn: () => {
      if (!payingWallet || !sourceToken || !recipient || parsedAmount === null) throw new Error("Quote unavailable");
      return requestSquidDepositRoute(
        {
          ...depositTarget,
          owner: getAddress(payingWallet.address),
          recipient,
          sourceChainId,
          sourceToken: sourceToken.token,
          sourceAmount: parsedAmount,
        },
        squid,
        { quoteOnly: true },
      );
    },
    queryKey: [
      "squid-deposit-quote",
      sourceChainId,
      sourceToken?.token,
      parsedAmount?.toString(),
      payingWallet?.address,
      recipient,
    ],
    retry: false,
    staleTime: 20_000,
  });
  const quote = quoteQuery.data;
  const rate = quote && sourceToken ? getUsdfcPerUsdc(quote, sourceToken.decimals) : null;
  const filGasTopUp = quote ? planFilGasTopUp(quote, squid.now ?? Date.now) : undefined;
  const requiredNative =
    quote && balances
      ? getDepositRequiredNativeBalance(quote, sourceChainId, APPROVAL_GAS_UNITS * balances.gasPrice)
      : null;
  const hasInsufficientGas = balances !== undefined && requiredNative !== null && balances.native < requiredNative;
  const gasShortfall =
    balances !== undefined && requiredNative !== null && requiredNative > balances.native
      ? requiredNative - balances.native
      : 0n;
  // Offer twice the shortfall so one top-up covers a retry, never less than the minimum the onramp accepts.
  const gasTopUpAmount = Math.max(Number(formatUnits(gasShortfall, 18)) * 2, MINIMUM_GAS_TOP_UP).toFixed(4);

  return {
    balances,
    balancesQuery,
    filGasTopUp,
    gasTopUpAmount,
    hasInsufficientGas,
    hasInsufficientUsdc,
    parsedAmount,
    quote,
    quoteQuery,
    rate,
    requiredNative,
    sourceToken,
    tokensQuery,
    usdcTokens,
  };
}
