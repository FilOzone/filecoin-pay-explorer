import { executeSquidFunding, SQUID_ROUTER_ADDRESS } from "squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import { executeSquidTopUp } from "./squid-execution";

vi.mock("squid-evm-funding", () => ({
  executeSquidFunding: vi.fn(),
  SQUID_ROUTER_ADDRESS: "0x1111111111111111111111111111111111111111",
}));

const source = {
  chainId: 10,
  decimals: 18,
  symbol: "ETH",
  token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
} as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
describe("executeSquidTopUp", () => {
  it("executes the reviewed OP Stack plan with an explicit fee cap and trusted router", async () => {
    const plan = { maxSourceAmount: 2_000_000_000_000_000_000n, owner, quotes: [], slippage: 1, source };
    vi.mocked(executeSquidFunding).mockResolvedValue({ nativeFee: 1n, routes: [], sourceAmount: 2n });

    await executeSquidTopUp({
      destinationClient: {} as never,
      integratorId: "test-integrator",
      maxNativeFee: 3n,
      plan,
      sourcePublicClient: {} as never,
      sourceWalletClient: {} as never,
    });

    expect(executeSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        feeMode: "op-stack",
        maxNativeFee: 3n,
        trustedSpender: SQUID_ROUTER_ADDRESS,
        trustedTarget: SQUID_ROUTER_ADDRESS,
        plan,
      }),
      expect.objectContaining({
        destinationClient: expect.anything(),
        publicClient: expect.anything(),
        walletClient: expect.anything(),
      }),
    );
  });
});
