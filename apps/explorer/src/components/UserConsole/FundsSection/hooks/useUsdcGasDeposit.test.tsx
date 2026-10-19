// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type PaymasterDepositPlanResult, planPaymasterDeposit } from "../data/paymaster-deposit-plan";
import type { SquidDepositQuote } from "../data/squid-deposit-route";
import { useUsdcGasDeposit } from "./useUsdcGasDeposit";

vi.mock("@privy-io/react-auth", () => ({ useSign7702Authorization: () => ({ signAuthorization: vi.fn() }) }));
vi.mock("../data/paymaster-eligibility", () => ({ isPaymasterEligible: () => true }));
vi.mock("../data/paymaster-deposit-execution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/paymaster-deposit-execution")>()),
  createPaymasterBundler: () => ({}),
  readUserOperationGasPrice: async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
}));
vi.mock("../data/paymaster-deposit-plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/paymaster-deposit-plan")>()),
  planPaymasterDeposit: vi.fn(),
}));

const quote = { quoteId: "quote-1", sourceAmount: 10_000_000n } as SquidDepositQuote;
const sized: PaymasterDepositPlanResult = {
  kind: "sized",
  gasMaximum: 24_000n,
  maxSwapInput: 0n,
  maxTransactionValue: 0n,
  quote,
};

function renderPlan() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ active, budget }: { active: boolean; budget: bigint }) =>
      useUsdcGasDeposit({
        active,
        budget,
        nativeBalance: 0n,
        quote,
        request: {
          owner: "0x1111111111111111111111111111111111111111",
          payments: "0x5555555555555555555555555555555555555555",
          recipient: "0x1111111111111111111111111111111111111111",
          sourceChainId: 8453,
          sourceToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          usdfc: "0x4444444444444444444444444444444444444444",
        },
        requiredNative: 1n,
        sourceClient: {} as Parameters<typeof useUsdcGasDeposit>[0]["sourceClient"],
        squid: { integratorId: "test" },
        wallet: { walletClientType: "privy" } as Parameters<typeof useUsdcGasDeposit>[0]["wallet"],
        withFilGasTopUp: false,
      }),
    { initialProps: { active: true, budget: 10_000_000n }, wrapper },
  );
}

const floors = () => vi.mocked(planPaymasterDeposit).mock.calls.map(([input]) => input.gasMaximumFloor);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useUsdcGasDeposit", () => {
  it("reserves what an execution needed only for the amount it was measured on", async () => {
    vi.mocked(planPaymasterDeposit).mockResolvedValue(sized);
    const { result, rerender } = renderPlan();
    await waitFor(() => expect(result.current.status).toEqual({ status: "ready" }));
    // The form plans nothing while the review is open; execution fails, and the form opens again.
    rerender({ active: false, budget: 10_000_000n });
    act(() => result.current.reviewAgain(30_000n));
    rerender({ active: true, budget: 10_000_000n });
    await waitFor(() => expect(floors()).toEqual([undefined, 30_000n]));

    rerender({ active: true, budget: 11_000_000n });
    await waitFor(() => expect(floors()).toEqual([undefined, 30_000n, undefined]));
  });

  it("drops the reviewed plan so Review waits for a fresh one", async () => {
    vi.mocked(planPaymasterDeposit)
      .mockResolvedValueOnce(sized)
      .mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderPlan();
    await waitFor(() => expect(result.current.plan).toEqual(sized));
    rerender({ active: false, budget: 10_000_000n });
    act(() => result.current.reviewAgain(undefined));
    rerender({ active: true, budget: 10_000_000n });

    await waitFor(() => expect(result.current.status).toEqual({ status: "planning" }));
    expect(result.current.plan).toBeUndefined();
  });
});
