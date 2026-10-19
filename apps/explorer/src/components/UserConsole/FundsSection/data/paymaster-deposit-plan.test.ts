import type { Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type PlanPaymasterDepositInput, planPaymasterDeposit } from "./paymaster-deposit-plan";
import { quoteSquidDeposit, type SquidDepositQuote } from "./squid-deposit-route";

vi.mock("./squid-deposit-route", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./squid-deposit-route")>()),
  quoteSquidDeposit: vi.fn(),
}));

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
const BRIDGE_FEE = 300_000_000_000_000n;

const ethCost = (amount: bigint, gasLimit?: bigint) => ({
  amount,
  name: "fee",
  token: { address: NATIVE, chainId: 8453, decimals: 18, symbol: "ETH" },
  ...(gasLimit ? { gasLimit } : {}),
});

function quoteFor(amount: bigint, { routeGas }: { routeGas?: bigint } = { routeGas: 500_000n }): SquidDepositQuote {
  return {
    destinationAmount: amount * 10n ** 12n,
    fees: [ethCost(BRIDGE_FEE)],
    gasCosts: [ethCost(10n ** 15n, routeGas)],
    minimumDestinationAmount: amount * 10n ** 12n,
    quoteId: `quote-${amount}`,
    sourceAmount: amount,
    sourceChainId: 8453,
  };
}

function setUp({ code, routeGas }: { code?: Hex; routeGas?: bigint } = {}) {
  vi.mocked(quoteSquidDeposit).mockImplementation(async (request) =>
    quoteFor(request.sourceAmount, routeGas === undefined ? undefined : { routeGas }),
  );
  const client = {
    getCode: vi.fn(async () => code),
    multicall: vi.fn(async () => [35_000, 0, 2_500_000_000n]),
    // 1.5x the 0.0003 ETH fee at 2,500 USDC/ETH.
    simulateContract: vi.fn(async () => ({ result: [1_125_000n, 0n, 0, 0n] })),
  } as unknown as PlanPaymasterDepositInput["client"];
  const input = (budget: bigint): PlanPaymasterDepositInput => ({
    budget,
    client,
    maxFeePerGas: 2_000_000n,
    request: {
      owner: PAYER,
      payments: "0x5555555555555555555555555555555555555555",
      recipient: PAYER,
      sourceChainId: 8453,
      sourceToken: USDC,
      usdfc: "0x4444444444444444444444444444444444444444",
    },
    squid: { integratorId: "test" },
    withFilGasTopUp: true,
  });
  return { client, input };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("planPaymasterDeposit", () => {
  it("deposits what is left once the bridge-fee swap and the USDC gas maximum come out of the budget", async () => {
    const { client, input } = setUp();

    // Swap cap: 1,125,000 + 1% = 1,136,250. Gas: (2,885,000 gas + 35,000 extra) at 1.5x 2,000,000 wei, priced at
    // 2,750 USDC/ETH (10% over the oracle) = 24,090.x units, floored, + 1.
    await expect(planPaymasterDeposit(input(10_000_000n))).resolves.toEqual({
      kind: "sized",
      gasMaximum: 24_091n,
      maxTransactionValue: 450_000_000_000_000n,
      maxSwapInput: 1_136_250n,
      quote: quoteFor(8_839_659n),
    });
    expect(
      vi.mocked(quoteSquidDeposit).mock.calls.map(([request, , options]) => [request.sourceAmount, options]),
    ).toEqual([
      [10_000_000n, { withFilGasTopUp: true }],
      [8_839_659n, { withFilGasTopUp: true }],
    ]);
    // The swap is reserved for the capped fee, not the quoted one.
    expect(vi.mocked(client.simulateContract).mock.calls[0]?.[0]).toMatchObject({
      args: [expect.objectContaining({ amount: 450_000_000_000_000n })],
    });
  });

  it("sizes from a quote already fetched for the whole budget instead of quoting it again", async () => {
    const { input } = setUp();

    await expect(
      planPaymasterDeposit({ ...input(10_000_000n), firstQuote: quoteFor(10_000_000n) }),
    ).resolves.toMatchObject({ kind: "sized", quote: quoteFor(8_839_659n) });
    expect(vi.mocked(quoteSquidDeposit).mock.calls.map(([request]) => request.sourceAmount)).toEqual([8_839_659n]);
  });

  it("assumes a 1M-gas route when Squid reports no gas limit", async () => {
    const { input } = setUp({ routeGas: 0n });

    // (3,385,000 + 35,000) gas at 3,000,000 wei and 2,750 USDC/ETH = 28,215.x units, floored, + 1.
    await expect(planPaymasterDeposit(input(10_000_000n))).resolves.toMatchObject({ gasMaximum: 28_216n });
  });

  it("reports the reserve when the budget cannot cover it", async () => {
    const { input } = setUp();

    await expect(planPaymasterDeposit(input(1_000_000n))).resolves.toEqual({
      kind: "insufficient-usdc",
      reserved: 1_160_341n,
    });
  });

  it("stops before quoting when the account delegates to another contract", async () => {
    const { input } = setUp({ code: "0xef01001111111111111111111111111111111111111111" });

    await expect(planPaymasterDeposit(input(10_000_000n))).resolves.toEqual({ kind: "conflicting-delegation" });
    expect(quoteSquidDeposit).not.toHaveBeenCalled();
  });
});
