// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUsdcGasPayer } from "../data/usdc-gas-payer";
import { useUsdcGasDeposit } from "./useUsdcGasDeposit";

vi.mock("@privy-io/react-auth", () => ({ useSign7702Authorization: () => ({ signAuthorization: vi.fn() }) }));
vi.mock("../data/paymaster-deposit-execution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/paymaster-deposit-execution")>()),
  createPaymasterBundler: () => ({}),
}));
vi.mock("../data/usdc-gas-payer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/usdc-gas-payer")>()),
  checkUsdcGasPayer: vi.fn(),
}));

const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
type Props = { active: boolean; walletClientType?: string; sourceChainId?: number; sourceToken?: Address };

function renderUsdcGas(initialProps: Props = { active: true }) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ active, sourceChainId = 8453, sourceToken = BASE_USDC, walletClientType = "privy" }: Props) =>
      useUsdcGasDeposit({
        active,
        request: { owner: "0x1111111111111111111111111111111111111111", sourceChainId, sourceToken },
        sourceClient: {} as Parameters<typeof useUsdcGasDeposit>[0]["sourceClient"],
        squid: { integratorId: "test" },
        wallet: { walletClientType } as Parameters<typeof useUsdcGasDeposit>[0]["wallet"],
      }),
    { initialProps, wrapper },
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("useUsdcGasDeposit", () => {
  it("pays Base USDC deposits from an embedded wallet in USDC gas, whatever ETH it holds", async () => {
    vi.mocked(checkUsdcGasPayer).mockResolvedValue("ready");
    const { result } = renderUsdcGas();

    await waitFor(() => expect(result.current.check).toEqual({ payer: "ready", failed: false }));
    expect(result.current.isEligible).toBe(true);
  });

  it.each([
    ["an extension wallet", { walletClientType: "metamask" }],
    ["another chain", { sourceChainId: 42161 }],
    ["another token", { sourceToken: "0x4200000000000000000000000000000000000006" }],
  ] satisfies [string, Omit<Props, "active">][])("leaves %s on the ETH path", (_label, props) => {
    const { result } = renderUsdcGas({ active: true, ...props });

    expect(result.current.isEligible).toBe(false);
    expect(result.current.check).toBeUndefined();
    expect(checkUsdcGasPayer).not.toHaveBeenCalled();
  });

  it("drops the check so Review waits for a fresh one", async () => {
    vi.mocked(checkUsdcGasPayer)
      .mockResolvedValueOnce("ready")
      .mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderUsdcGas();
    await waitFor(() => expect(result.current.check).toEqual({ payer: "ready", failed: false }));
    rerender({ active: false });
    act(() => result.current.reviewAgain());
    rerender({ active: true });

    await waitFor(() => expect(result.current.check).toEqual({ payer: undefined, failed: false }));
  });
});
