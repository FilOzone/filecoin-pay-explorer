import { NATIVE_TOKEN_ADDRESS, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  getSourceTokenBalance,
  getSourceTokenBalancesQueryKey,
  orderSourceTokensByBalance,
  readSourceTokenBalances,
  readSourceTokenState,
} from "./source-token-balances";

const OWNER = "0x1111111111111111111111111111111111111111";
const token = (index: number, symbol = `T${index}`): SourceToken => ({
  chainId: 8453,
  decimals: 18,
  symbol,
  token: `0x${index.toString(16).padStart(40, "0")}` as `0x${string}`,
});

describe("source token balances", () => {
  it("reads an ERC-20 balance and allowance in one multicall beside the native balance", async () => {
    const multicall = vi.fn<(args: { allowFailure: boolean; contracts: unknown[] }) => Promise<bigint[]>>(async () => [
      8n,
      3n,
    ]);
    const client = { getBalance: vi.fn(async () => 7n), multicall };
    const spender = "0x9999999999999999999999999999999999999999";

    await expect(readSourceTokenState(client as never, OWNER, token(2).token, spender)).resolves.toEqual({
      allowance: 3n,
      native: 7n,
      token: 8n,
    });
    expect(multicall).toHaveBeenCalledOnce();
    expect(multicall.mock.calls[0][0]).toMatchObject({
      allowFailure: false,
      contracts: [
        { address: token(2).token, args: [OWNER], functionName: "balanceOf" },
        { address: token(2).token, args: [OWNER, spender], functionName: "allowance" },
      ],
    });

    await expect(readSourceTokenState(client as never, OWNER, NATIVE_TOKEN_ADDRESS, spender)).resolves.toEqual({
      allowance: 0n,
      native: 7n,
      token: 7n,
    });
    expect(multicall).toHaveBeenCalledOnce();
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
    expect(balances).toEqual({
      ...Object.fromEntries(
        tokens.slice(0, 100).map((entry, index) => [entry.token, index === 2 ? null : BigInt(index + 1)]),
      ),
      [tokens[100].token]: null,
      [native.token.toLowerCase()]: 500n,
    });
    expect(getSourceTokenBalance(balances, tokens[2].token.toUpperCase())).toBeNull();
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
    expect(getSourceTokenBalancesQueryKey(OWNER, 8453, [second, first, first])).toEqual(
      getSourceTokenBalancesQueryKey(OWNER, 8453, [first, second]),
    );
  });
});
