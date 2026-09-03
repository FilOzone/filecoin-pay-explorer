import type { ConnectedWallet } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { type Address, erc20Abi, formatUnits, getAddress } from "viem";
import type { usePublicClient } from "wagmi";
import { parseFundingAmount } from "../../data/funding-runway";
import { isNativeToken } from "../../data/guided-top-up";
import {
  getDepositRequiredNativeBalance,
  getUsdfcPerSourceUnit,
  planFilGasTopUp,
  requestSquidDepositRoute,
  type SquidClient,
  type SquidDepositTarget,
} from "../../data/squid-deposit-route";
import { paymentTokensQueryOptions } from "../../data/squid-payment-tokens";

// Gas units for the token approval that precedes a first purchase, priced at the current gas price.
const APPROVAL_GAS_UNITS = 60_000n;
const MINIMUM_GAS_TOP_UP = 0.002;

export type DepositContracts = Pick<SquidDepositTarget, "payments" | "usdfc">;

/**
 * Everything the dialog needs to know before the user confirms: the tokens
 * Squid accepts on the source network, the paying wallet's balances, and a
 * quote for the typed amount, with the shortfalls derived from them.
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
  const tokensQuery = useQuery({ ...paymentTokensQueryOptions(sourceChainId, squid), enabled: open });
  const paymentTokens = tokensQuery.data ?? [];
  // The list leads with plain USDC, so that is what an unresolved choice falls back to.
  const sourceToken =
    paymentTokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase()) ?? paymentTokens[0];
  const isNativeSource = !!sourceToken && isNativeToken(sourceToken.token);

  const balancesQuery = useQuery({
    enabled: open && !!sourceClient && !!payingWallet && !!sourceToken,
    queryFn: async () => {
      if (!sourceClient || !payingWallet || !sourceToken) throw new Error("Balances are unavailable");
      const owner = getAddress(payingWallet.address);
      const [native, gasPrice] = await Promise.all([
        sourceClient.getBalance({ address: owner }),
        sourceClient.getGasPrice(),
      ]);
      // The native coin pays with the same balance it pays gas from.
      const token = isNativeSource
        ? native
        : await sourceClient.readContract({
            abi: erc20Abi,
            address: sourceToken.token,
            args: [owner],
            functionName: "balanceOf",
          });
      return { token, native, gasPrice };
    },
    queryKey: ["squid-deposit-balances", sourceChainId, sourceToken?.token, payingWallet?.address],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const balances = balancesQuery.data;

  const parsedAmount = sourceToken ? parseFundingAmount(amount, sourceToken.decimals) : null;
  const hasInsufficientToken = balances !== undefined && parsedAmount !== null && balances.token < parsedAmount;
  // No quote for an amount the wallet cannot pay: the shortfall is the answer then.
  const quoteQuery = useQuery({
    enabled:
      open &&
      isQuoting &&
      !!payingWallet &&
      !!sourceToken &&
      !!recipient &&
      parsedAmount !== null &&
      !hasInsufficientToken,
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
  const rate = quote && sourceToken ? getUsdfcPerSourceUnit(quote, sourceToken.decimals) : null;
  const filGasTopUp = quote ? planFilGasTopUp(quote, squid.now ?? Date.now) : undefined;
  // A native payment needs no approval; an ERC-20 one signs it before the swap.
  const requiredNative =
    quote && balances
      ? getDepositRequiredNativeBalance(
          quote,
          sourceChainId,
          isNativeSource ? 0n : APPROVAL_GAS_UNITS * balances.gasPrice,
        )
      : null;
  // Paying with the native coin spends the amount and the gas from one balance.
  const requiredNativeWithAmount =
    requiredNative === null ? null : requiredNative + (isNativeSource && parsedAmount !== null ? parsedAmount : 0n);
  const hasInsufficientGas =
    balances !== undefined && requiredNativeWithAmount !== null && balances.native < requiredNativeWithAmount;
  const gasShortfall =
    balances !== undefined && requiredNativeWithAmount !== null && requiredNativeWithAmount > balances.native
      ? requiredNativeWithAmount - balances.native
      : 0n;
  // Offer twice the shortfall so one top-up covers a retry, never less than the minimum the onramp accepts.
  const gasTopUpAmount = Math.max(Number(formatUnits(gasShortfall, 18)) * 2, MINIMUM_GAS_TOP_UP).toFixed(4);
  // What Max may fill in: the whole token balance, less the gas a native payment must keep back.
  const spendable =
    balances === undefined
      ? undefined
      : isNativeSource
        ? balances.token > (requiredNative ?? 0n)
          ? balances.token - (requiredNative ?? 0n)
          : 0n
        : balances.token;

  return {
    balances,
    balancesQuery,
    filGasTopUp,
    gasTopUpAmount,
    hasInsufficientGas,
    hasInsufficientToken,
    isNativeSource,
    parsedAmount,
    paymentTokens,
    quote,
    quoteQuery,
    rate,
    requiredNative,
    sourceToken,
    spendable,
    tokensQuery,
  };
}
