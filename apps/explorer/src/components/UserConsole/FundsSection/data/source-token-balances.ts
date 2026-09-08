import { NATIVE_TOKEN_ADDRESS, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { type Address, erc20Abi, type PublicClient } from "viem";

const BALANCE_BATCH_SIZE = 100;
const normalizeAddress = (address: string) => address.toLowerCase();

export type SourceTokenBalances = Readonly<Record<string, bigint | null>>;

export function getSourceTokenCatalogIdentity(tokens: readonly SourceToken[]) {
  return [...new Set(tokens.map(({ token }) => normalizeAddress(token)))].sort().join(",");
}

export function getSourceTokenBalancesQueryKey(
  owner: Address | undefined,
  chainId: number,
  tokens: readonly SourceToken[],
) {
  return ["squid", "source-token-balances", owner ?? "", chainId, getSourceTokenCatalogIdentity(tokens)] as const;
}

export interface SourceTokenState {
  /** Router allowance; always 0 for the native token, which needs none. */
  allowance: bigint;
  native: bigint;
  token: bigint;
}

/**
 * Balance, native balance and router allowance of one source token in one
 * batched round trip: the two ERC-20 reads share a multicall, and the native
 * read runs alongside it.
 */
export async function readSourceTokenState(
  client: Pick<PublicClient, "getBalance" | "multicall">,
  owner: Address,
  tokenAddress: Address,
  spender: Address,
  /** Pins the read to a block, so a node behind it fails instead of answering with older state. */
  blockNumber?: bigint,
): Promise<SourceTokenState> {
  const at = blockNumber === undefined ? {} : { blockNumber };
  const nativePromise = client.getBalance({ address: owner, ...at });
  if (normalizeAddress(tokenAddress) === normalizeAddress(NATIVE_TOKEN_ADDRESS)) {
    const native = await nativePromise;
    return { allowance: 0n, native, token: native };
  }
  const [[token, allowance], native] = await Promise.all([
    client.multicall({
      ...at,
      allowFailure: false,
      contracts: [
        { abi: erc20Abi, address: tokenAddress, args: [owner], functionName: "balanceOf" as const },
        { abi: erc20Abi, address: tokenAddress, args: [owner, spender], functionName: "allowance" as const },
      ],
    }),
    nativePromise,
  ]);
  return { allowance, native, token };
}

export async function readSourceTokenBalances(
  client: Pick<PublicClient, "getBalance" | "multicall">,
  owner: Address,
  tokens: readonly SourceToken[],
): Promise<SourceTokenBalances> {
  const uniqueTokens = [...new Map(tokens.map((token) => [normalizeAddress(token.token), token])).values()];
  const nativeToken = uniqueTokens.find(
    (token) => normalizeAddress(token.token) === normalizeAddress(NATIVE_TOKEN_ADDRESS),
  );
  const erc20Tokens = uniqueTokens.filter(
    (token) => normalizeAddress(token.token) !== normalizeAddress(NATIVE_TOKEN_ADDRESS),
  );
  const balances: Record<string, bigint | null> = {};
  // A failed read stays unknown (null) rather than becoming a false zero; the
  // selector shows it as "Balance unavailable" and ranks it last.
  const nativeBalance = nativeToken
    ? client.getBalance({ address: owner }).catch(() => null)
    : Promise.resolve<bigint | null>(null);

  for (let index = 0; index < erc20Tokens.length; index += BALANCE_BATCH_SIZE) {
    const batch = erc20Tokens.slice(index, index + BALANCE_BATCH_SIZE);
    try {
      const results = await client.multicall({
        allowFailure: true,
        contracts: batch.map((token) => ({
          abi: erc20Abi,
          address: token.token,
          args: [owner],
          functionName: "balanceOf" as const,
        })),
      });
      batch.forEach((token, resultIndex) => {
        const result = results[resultIndex];
        balances[normalizeAddress(token.token)] =
          result?.status === "success" && typeof result.result === "bigint" ? result.result : null;
      });
    } catch {
      // Same rule for a failed batch: unknown, never zero.
      batch.forEach((token) => {
        balances[normalizeAddress(token.token)] = null;
      });
    }
  }

  if (nativeToken) balances[normalizeAddress(nativeToken.token)] = await nativeBalance;
  return balances;
}

/** Funded, then zero, then unknown. Plain USDC leads within each group; other ties keep catalog order. */
export function orderSourceTokensByBalance(tokens: readonly SourceToken[], balances: SourceTokenBalances) {
  const rank = (token: SourceToken) => {
    const balance = balances[normalizeAddress(token.token)];
    return balance == null ? 0 : balance === 0n ? 1 : 2;
  };
  return [...tokens].sort((left, right) => {
    const byBalance = rank(right) - rank(left);
    if (byBalance !== 0) return byBalance;
    return Number(right.symbol.toUpperCase() === "USDC") - Number(left.symbol.toUpperCase() === "USDC");
  });
}

export function getSourceTokenBalance(balances: SourceTokenBalances | undefined, token: string) {
  return balances?.[normalizeAddress(token)];
}
