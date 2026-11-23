import { type Address, createPublicClient, isAddress, zeroAddress } from "viem";
import { base } from "viem/chains";
import { mainnet } from "@/constants/chains";
import { getPublicClient } from "@/services/viem/client";
import { createChainTransport } from "@/services/wagmi/transports";
import { CIRCLE_PAYMASTER_TOKEN } from "./circle-paymaster";
import { quoteSwapInputCap } from "./paymaster-batch";
import {
  applyNetworkFeeReviewHeadroom,
  FIL_GAS_TOP_UP_AMOUNT,
  getSourceNativeCosts,
  getSquidIntegratorId,
  isExecutableQuote,
  planFilGasTopUp,
  requestSquidDepositRoute,
} from "./squid-deposit-route";
import { checkUsdcGasPayer, FEE_RESERVE_USDC } from "./usdc-gas-payer";

export interface GuestRouteEstimate {
  quoteId: string;
  /** Base USDC which will be sent through the bridge, in base units. */
  sourceSpendUsdc: bigint;
  /** Total USDC retained by the current conversion flow for Base and bridge fees, including bridgeFeeUsdc. */
  networkReserveUsdc: bigint;
  /** Maximum USDC required to buy the native ETH value of this exact bridge transaction. */
  bridgeFeeUsdc: bigint;
  minimumDepositUsdfc: bigint;
  minimumFil: bigint;
  filSpendUsdfc: bigint;
  expiresAt: number;
  /** The existing paymaster can only estimate the full user operation after the wallet is funded and signs a permit. */
  paymentBlocker: string;
}

/** Preview the conversion using the USDC Coinbase quoted to this wallet, before it owns any crypto. */
export async function getGuestRouteEstimate({
  wallet,
  receivedUsdc,
}: {
  wallet: Address;
  receivedUsdc: bigint;
}): Promise<GuestRouteEstimate> {
  if (!isAddress(wallet) || wallet === zeroAddress) throw new Error("A valid Base wallet is required.");
  const sourceSpendUsdc = receivedUsdc - FEE_RESERVE_USDC;
  if (sourceSpendUsdc <= 0n) throw new Error("The quoted USDC does not cover the conversion fee reserve.");

  const { usdfc, payments } = mainnet.contracts;
  const source = createPublicClient({ chain: base, transport: createChainTransport(base.id) });
  // Price FIL from its own pool even when Squid swaps the bridged stablecoin directly into USDFC.
  const topUp = await planFilGasTopUp(getPublicClient("mainnet"), usdfc.address, Date.now).catch(() => {
    throw new Error("The Filecoin pool could not price the native FIL reserve. Refresh the estimate to try again.");
  });
  const quote = await requestSquidDepositRoute(
    {
      payments: payments.address,
      usdfc: usdfc.address,
      recipient: wallet,
      owner: wallet,
      sourceChainId: base.id,
      sourceToken: CIRCLE_PAYMASTER_TOKEN,
      sourceAmount: sourceSpendUsdc,
      filGasTopUp: topUp,
    },
    {
      integratorId: getSquidIntegratorId(),
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
    },
    { quoteOnly: false },
  ).catch(() => {
    throw new Error(
      "Squid could not verify a route with both a Filecoin Pay deposit and native FIL. Try refreshing the estimate or changing the amount.",
    );
  });
  if (
    !isExecutableQuote(quote) ||
    quote.filGasTopUp?.minimumFil !== FIL_GAS_TOP_UP_AMOUNT ||
    quote.filGasTopUp.spendUsdfc <= 0n ||
    quote.minimumDestinationAmount <= 0n ||
    quote.minimumDestinationAmount > quote.destinationAmount
  ) {
    throw new Error("Squid could not quote both the Filecoin Pay deposit and the native FIL reserve.");
  }

  if (quote.transaction.expiresAt === undefined) {
    throw new Error("Squid did not provide an expiry for the conversion. Refresh the estimate.");
  }
  const expiresAt = quote.transaction.expiresAt * 1000;
  // Its native value buys the bridge service; the existing executor caps it against Squid's reviewed fees.
  const nativeFees = getSourceNativeCosts(quote, base.id).fees;
  if (
    (nativeFees > 0n && quote.transaction.value === 0n) ||
    quote.transaction.value > applyNetworkFeeReviewHeadroom(nativeFees)
  ) {
    throw new Error("Squid's bridge payment does not match the reviewed Base fee budget. Refresh the estimate.");
  }
  const [bridgeFeeUsdc, payer] = await Promise.all([
    quoteSwapInputCap(source, CIRCLE_PAYMASTER_TOKEN, quote.transaction.value).catch(() => {
      throw new Error("The Base bridge fee could not be priced in USDC.");
    }),
    checkUsdcGasPayer(source, wallet).catch(() => {
      throw new Error("The Base paymaster could not confirm that this wallet can pay fees in USDC.");
    }),
  ]);
  if (quote.transaction.value > 0n && bridgeFeeUsdc <= 0n) {
    throw new Error("The Base bridge fee could not be priced in USDC.");
  }
  if (expiresAt <= Date.now()) throw new Error("The conversion quote expired. Request a fresh estimate.");

  let paymentBlocker = "Base gas coverage for this wallet cannot be verified before payment.";
  if (payer === "conflict") {
    paymentBlocker = "This wallet uses a different smart account and cannot pay Base gas with this purchase.";
  } else if (bridgeFeeUsdc >= FEE_RESERVE_USDC) {
    paymentBlocker = "The bridge fee uses the full USDC fee reserve, leaving no USDC for Base gas.";
  }
  return {
    quoteId: quote.quoteId,
    sourceSpendUsdc,
    networkReserveUsdc: FEE_RESERVE_USDC,
    bridgeFeeUsdc,
    minimumDepositUsdfc: quote.minimumDestinationAmount,
    minimumFil: quote.filGasTopUp.minimumFil,
    filSpendUsdfc: quote.filGasTopUp.spendUsdfc,
    expiresAt,
    paymentBlocker,
  };
}
