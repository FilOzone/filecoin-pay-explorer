import { NATIVE_TOKEN_ADDRESS, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  orderSourceTokensByBalance,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalance,
  sourceTokenBalancesQueryKey,
} from "./source-token-balances";

const OWNER = "0x1111111111111111111111111111111111111111";
const token = (index: number, symbol = `T${index}`): SourceToken => ({
  chainId: 8453,
  decimals: 18,
  symbol,
  token: `0x${index.toString(16).padStart(40, "0")}` as `0x${string}`,
});

describe("source token balances", () => {
  it("reads native balances directly and ERC-20 balances through the contract", async () => {
    const client = { getBalance: vi.fn(async () => 7n), readContract: vi.fn(async () => 8n) };
    const native = { ...token(1, "ETH"), token: NATIVE_TOKEN_ADDRESS };
    await expect(readSourceTokenBalance(client as never, OWNER, native)).resolves.toBe(7n);
    await expect(readSourceTokenBalance(client as never, OWNER, token(2))).resolves.toBe(8n);
    expect(client.readContract).toHaveBeenCalledOnce();
  });

  it("deduplicates addresses, batches ERC-20 calls at 100, and keeps failures unknown", async () => {
    const tokens = Array.from({ length: 101 }, (_, index) => token(index + 1));
    const native = { ...token(999, "ETH"), token: NATIVE_TOKEN_ADDRESS };
    const multicall = vi
      .fn()
      .mockResolvedValueOnce(
        tokens
          .slice(0, 100)
          .map((_, index) => (index === 2 ? { status: "failure" } : { status: "success", result: BigInt(index + 1) })),
      )
      .mockRejectedValueOnce(new Error("RPC unavailable"));
    const balances = await readSourceTokenBalances({ getBalance: vi.fn(async () => 500n), multicall } as never, OWNER, [
      ...tokens,
      tokens[0],
      native,
    ]);
    expect(multicall.mock.calls.map(([request]) => request.contracts.length)).toEqual([100, 1]);
    expect(sourceTokenBalance(balances, tokens[0].token)).toBe(1n);
    expect(sourceTokenBalance(balances, tokens[2].token)).toBeNull();
    expect(sourceTokenBalance(balances, tokens[100].token)).toBeNull();
    expect(sourceTokenBalance(balances, native.token)).toBe(500n);
  });

  it("orders funded before zero before unknown, with USDC first inside a group and stable remaining ties", () => {
    const [dai, usdc, weth, usdt, wbtc] = [
      token(1, "DAI"),
      token(2, "USDC"),
      token(3, "WETH"),
      token(4, "USDT"),
      token(5, "WBTC"),
    ];
    const balances = { [dai.token]: 4n, [usdc.token]: 2n, [weth.token]: 0n, [usdt.token]: null };
    expect(orderSourceTokensByBalance([dai, usdc, weth, usdt, wbtc], balances).map(({ symbol }) => symbol)).toEqual([
      "USDC",
      "DAI",
      "WETH",
      "USDT",
      "WBTC",
    ]);
  });

  it("keys a scan by owner, chain, and address-stable catalog identity", () => {
    const first = token(1);
    const second = token(2);
    expect(sourceTokenBalancesQueryKey(OWNER, 8453, [second, first, first])).toEqual(
      sourceTokenBalancesQueryKey(OWNER, 8453, [first, second]),
    );
  });
});
