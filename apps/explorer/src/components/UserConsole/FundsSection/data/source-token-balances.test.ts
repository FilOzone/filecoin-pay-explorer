import { NATIVE_TOKEN_ADDRESS, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { describe, expect, it, vi } from "vitest";
import {
  hasUnknownSourceTokenBalances,
  nativeTokenFirst,
  orderSourceTokensByBalance,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalancesQueryKey,
  sourceTokenCatalogIdentity,
  visibleSourceTokens,
} from "./source-token-balances";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = (address: `0x${string}`, symbol: string): SourceToken => ({
  chainId: 8453,
  decimals: 18,
  symbol,
  token: address,
});
const native = token(NATIVE_TOKEN_ADDRESS, "ETH");
const usdc = token("0x2222222222222222222222222222222222222222", "USDC");
const usdt = token("0x3333333333333333333333333333333333333333", "USDT");

describe("source token balance inventory", () => {
  it("reads one selected native or ERC-20 balance", async () => {
    const getBalance = vi.fn().mockResolvedValue(7n);
    const readContract = vi.fn().mockResolvedValue(5n);
    const client = { getBalance, readContract } as never;

    await expect(readSourceTokenBalance(client, owner, native)).resolves.toBe(7n);
    await expect(readSourceTokenBalance(client, owner, usdc)).resolves.toBe(5n);
    expect(getBalance).toHaveBeenCalledOnce();
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: usdc.token, args: [owner], functionName: "balanceOf" }),
    );
  });

  it("puts the native token first before inventory is available", () => {
    expect(nativeTokenFirst([usdc, native, usdt]).map(({ symbol }) => symbol)).toEqual(["ETH", "USDC", "USDT"]);
  });

  it("deduplicates tokens, batches ERC-20 reads, and reads native balance separately", async () => {
    const getBalance = vi.fn().mockResolvedValue(7n);
    const multicall = vi.fn().mockResolvedValue([{ result: 5n, status: "success" }]);

    const balances = await readSourceTokenBalances({ getBalance, multicall } as never, owner, [
      native,
      usdc,
      { ...usdc },
    ]);

    expect(getBalance).toHaveBeenCalledOnce();
    expect(multicall).toHaveBeenCalledOnce();
    expect(multicall.mock.calls[0]?.[0].contracts).toHaveLength(1);
    expect(balances).toEqual({
      [NATIVE_TOKEN_ADDRESS.toLowerCase()]: 7n,
      [usdc.token.toLowerCase()]: 5n,
    });
  });

  it("bounds ERC-20 multicalls to 100 tokens", async () => {
    const tokens = Array.from({ length: 101 }, (_, index) =>
      token(`0x${(index + 1).toString(16).padStart(40, "0")}`, `T${index}`),
    );
    const multicall = vi
      .fn()
      .mockImplementation(({ contracts }) => Promise.resolve(contracts.map(() => ({ result: 0n, status: "success" }))));

    await readSourceTokenBalances({ getBalance: vi.fn(), multicall } as never, owner, tokens);

    expect(multicall).toHaveBeenCalledTimes(2);
    expect(multicall.mock.calls.map(([{ contracts }]) => contracts.length)).toEqual([100, 1]);
  });

  it("keeps failed balances unknown without discarding successful balances", async () => {
    const balances = await readSourceTokenBalances(
      {
        getBalance: vi.fn().mockRejectedValue(new Error("native RPC failed")),
        multicall: vi.fn().mockResolvedValue([
          { result: 5n, status: "success" },
          { error: new Error("token reverted"), status: "failure" },
        ]),
      } as never,
      owner,
      [native, usdc, usdt],
    );

    expect(balances).toEqual({
      [NATIVE_TOKEN_ADDRESS.toLowerCase()]: null,
      [usdc.token.toLowerCase()]: 5n,
      [usdt.token.toLowerCase()]: null,
    });
    expect(hasUnknownSourceTokenBalances([native, usdc, usdt], balances)).toBe(true);
  });

  it("orders held tokens first, then zero and unknown balances", () => {
    const balances = {
      [NATIVE_TOKEN_ADDRESS.toLowerCase()]: 1n,
      [usdc.token.toLowerCase()]: 0n,
      [usdt.token.toLowerCase()]: 2n,
    };

    expect(orderSourceTokensByBalance([usdc, usdt, native], balances).map(({ symbol }) => symbol)).toEqual([
      "ETH",
      "USDT",
      "USDC",
    ]);
    expect(
      orderSourceTokensByBalance([usdc, usdt], { [usdc.token.toLowerCase()]: 0n }).map(({ symbol }) => symbol),
    ).toEqual(["USDC", "USDT"]);
  });

  it("defaults to held tokens but preserves the full catalog when any balance is unknown", () => {
    expect(
      visibleSourceTokens([usdc, usdt], { [usdc.token.toLowerCase()]: 0n, [usdt.token.toLowerCase()]: 2n }, false).map(
        ({ symbol }) => symbol,
      ),
    ).toEqual(["USDT"]);
    expect(
      visibleSourceTokens([usdc, usdt], { [usdc.token.toLowerCase()]: 0n, [usdt.token.toLowerCase()]: 2n }, true),
    ).toHaveLength(2);
    expect(
      visibleSourceTokens([usdc, usdt], { [usdc.token.toLowerCase()]: 0n, [usdt.token.toLowerCase()]: null }, false),
    ).toHaveLength(2);
  });

  it("changes cache identity when the relevant catalog changes", () => {
    expect(sourceTokenCatalogIdentity([usdc, usdc])).toBe(usdc.token.toLowerCase());
    expect(sourceTokenCatalogIdentity([usdc])).not.toBe(sourceTokenCatalogIdentity([usdc, usdt]));
    expect(sourceTokenBalancesQueryKey(owner, 8453, [usdc])).not.toEqual(
      sourceTokenBalancesQueryKey(owner, 10, [usdc]),
    );
    expect(sourceTokenBalancesQueryKey(owner, 8453, [usdc])).not.toEqual(
      sourceTokenBalancesQueryKey("0x4444444444444444444444444444444444444444", 8453, [usdc]),
    );
  });
});
