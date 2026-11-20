import { NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { parseUnits, zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mainnet } from "@/constants/chains";
import { CIRCLE_PAYMASTER_TOKEN } from "./circle-paymaster";
import { getGuestRouteEstimate } from "./guestRoute";
import { quoteSwapInputCap } from "./paymaster-batch";
import { FIL_GAS_TOP_UP_AMOUNT, planFilGasTopUp } from "./squid-deposit-route";
import { checkUsdcGasPayer, FEE_RESERVE_USDC } from "./usdc-gas-payer";

vi.mock("./paymaster-batch", () => ({ quoteSwapInputCap: vi.fn() }));
vi.mock("./usdc-gas-payer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./usdc-gas-payer")>()),
  checkUsdcGasPayer: vi.fn(),
}));
vi.mock("./squid-deposit-route", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./squid-deposit-route")>()),
  planFilGasTopUp: vi.fn(),
}));

const wallet = "0x1111111111111111111111111111111111111111";
const now = new Date("2026-11-20T09:00:00Z");
const expiry = now.getTime() / 1000 + 60;
const reserve = { minimumFil: FIL_GAS_TOP_UP_AMOUNT, spendUsdfc: parseUnits("0.035", 18), deadline: BigInt(expiry) };
const bridgeValue = 6_000_000_000_000n;
const bridgeFee = 10_000n;
const receivedUsdc = parseUnits("4.94", 6);

function mockRoute({ omitTopUp = false, omitExpiry = false, nativeFee = bridgeValue } = {}) {
  const post = vi.fn(async (_url, { body }: RequestInit) => {
    const params = JSON.parse(String(body));
    // A common route goes straight into USDFC without any WFIL -> USDFC leg.
    const route = {
      quoteId: "quote-1",
      params: omitTopUp
        ? { ...params, postHook: { ...params.postHook, calls: params.postHook.calls.slice(2) } }
        : params,
      estimate: {
        actions: [
          { type: "swap", provider: "Sushiswap V3", fromToken: { symbol: "USDC.axl" }, toToken: { symbol: "USDFC" } },
          { type: "custom", toChain: "314", provider: "Filecoin Pay" },
        ],
        feeCosts: [
          {
            name: "Gas Receiver Fee",
            amount: nativeFee.toString(),
            token: { chainId: "8453", address: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18 },
          },
        ],
        gasCosts: [],
        toAmount: parseUnits("4.44", 18).toString(),
        toAmountMin: parseUnits("4.42", 18).toString(),
      },
      transactionRequest: {
        target: SQUID_ROUTER_ADDRESS,
        data: "0xabcd",
        gasLimit: "150000",
        ...(omitExpiry ? {} : { expiry }),
        value: bridgeValue.toString(),
      },
    };
    return Response.json({ route });
  });
  vi.stubGlobal("fetch", post);
  return post;
}

describe("guest checkout conversion preflight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(planFilGasTopUp).mockResolvedValue(reserve);
    vi.mocked(quoteSwapInputCap).mockResolvedValue(bridgeFee);
    vi.mocked(checkUsdcGasPayer).mockResolvedValue("ready");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("quotes the $5 purchase proceeds including the native FIL hook and prices the actual bridge value", async () => {
    const post = mockRoute();
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).resolves.toEqual({
      quoteId: "quote-1",
      sourceSpendUsdc: receivedUsdc - FEE_RESERVE_USDC,
      networkReserveUsdc: FEE_RESERVE_USDC,
      bridgeFeeUsdc: bridgeFee,
      minimumDepositUsdfc: parseUnits("4.385", 18),
      minimumFil: reserve.minimumFil,
      filSpendUsdfc: reserve.spendUsdfc,
      expiresAt: expiry * 1000,
      paymentBlocker: "Base gas coverage for this wallet cannot be verified before payment.",
    });
    const params = JSON.parse(String(post.mock.calls[0][1].body));
    expect(params).toMatchObject({
      fromAddress: wallet,
      toAddress: wallet,
      fromChain: "8453",
      fromToken: CIRCLE_PAYMASTER_TOKEN,
      fromAmount: "4440000",
      toChain: "314",
      toToken: mainnet.contracts.usdfc.address,
      quoteOnly: false,
    });
    expect(params.postHook.calls).toHaveLength(4);
    expect(quoteSwapInputCap).toHaveBeenCalledWith(expect.anything(), CIRCLE_PAYMASTER_TOKEN, bridgeValue);
  });

  it("rejects a USDFC quote that drops the FIL reserve from the hook", async () => {
    mockRoute({ omitTopUp: true });
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow(
      "both a Filecoin Pay deposit and native FIL",
    );
    expect(quoteSwapInputCap).not.toHaveBeenCalled();
  });

  it("rejects an executable route without an explicit validity window", async () => {
    mockRoute({ omitExpiry: true });
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow("did not provide an expiry");
    expect(quoteSwapInputCap).not.toHaveBeenCalled();
  });

  it("rejects a route whose native transaction payment exceeds the existing executor's fee cap", async () => {
    mockRoute({ nativeFee: 1n });
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow("reviewed Base fee budget");
    expect(quoteSwapInputCap).not.toHaveBeenCalled();
  });

  it("reports when the bridge alone exhausts the conversion's fee budget", async () => {
    mockRoute();
    vi.mocked(quoteSwapInputCap).mockResolvedValue(FEE_RESERVE_USDC);
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).resolves.toMatchObject({
      paymentBlocker: expect.stringContaining("leaving no USDC for Base gas"),
    });
  });

  it("gates a wallet with an incompatible delegation", async () => {
    mockRoute();
    vi.mocked(checkUsdcGasPayer).mockResolvedValue("conflict");
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).resolves.toMatchObject({
      paymentBlocker: expect.stringContaining("different smart account"),
    });
  });

  it("rejects an unpriced nonzero native bridge value", async () => {
    mockRoute();
    vi.mocked(quoteSwapInputCap).mockResolvedValue(0n);
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow("bridge fee could not be priced");
  });

  it("reports a pool outage without displaying RPC errors or calldata", async () => {
    const post = mockRoute();
    vi.mocked(planFilGasTopUp).mockRejectedValueOnce(new Error("Provider stack trace"));
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow(
      "The Filecoin pool could not price the native FIL reserve. Refresh the estimate to try again.",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a quote that expires while source fees are read", async () => {
    mockRoute();
    vi.mocked(checkUsdcGasPayer).mockImplementationOnce(async () => {
      vi.setSystemTime(expiry * 1000);
      return "ready";
    });
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc })).rejects.toThrow("quote expired");
  });

  it("does not request a route for insufficient proceeds or the zero address", async () => {
    const post = mockRoute();
    await expect(getGuestRouteEstimate({ wallet, receivedUsdc: FEE_RESERVE_USDC })).rejects.toThrow("fee reserve");
    await expect(getGuestRouteEstimate({ wallet: zeroAddress, receivedUsdc })).rejects.toThrow("wallet is required");
    expect(post).not.toHaveBeenCalled();
  });
});
