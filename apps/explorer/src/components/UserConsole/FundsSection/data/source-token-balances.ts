import { NATIVE_TOKEN_ADDRESS, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { type Address, erc20Abi, type PublicClient } from "viem";

const BALANCE_BATCH_SIZE = 100;

export type SourceTokenBalances = Readonly<Record<string, bigint | null>>;

const key = (address: string) => address.toLowerCase();

export function sourceTokenCatalogIdentity(tokens: readonly SourceToken[]) {
  return [...new Set(tokens.map(({ token }) => key(token)))].sort().join(",");
}

export function sourceTokenBalancesQueryKey(owner: Address, chainId: number, tokens: readonly SourceToken[]) {
  return ["squid", "source-token-balances", owner, chainId, sourceTokenCatalogIdentity(tokens)] as const;
}

export function readSourceTokenBalance(
  client: Pick<PublicClient, "getBalance" | "readContract">,
  owner: Address,
  token: SourceToken,
) {
  if (key(token.token) === key(NATIVE_TOKEN_ADDRESS)) return client.getBalance({ address: owner });
  return client.readContract({
    abi: erc20Abi,
    address: token.token,
    args: [owner],
    functionName: "balanceOf",
  });
}

export async function readSourceTokenBalances(
  client: Pick<PublicClient, "getBalance" | "multicall">,
  owner: Address,
  tokens: readonly SourceToken[],
): Promise<SourceTokenBalances> {
  const uniqueTokens = [...new Map(tokens.map((token) => [key(token.token), token])).values()];
  const nativeToken = uniqueTokens.find((token) => key(token.token) === key(NATIVE_TOKEN_ADDRESS));
  const erc20Tokens = uniqueTokens.filter((token) => key(token.token) !== key(NATIVE_TOKEN_ADDRESS));
  const balances: Record<string, bigint | null> = {};
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
        balances[key(token.token)] = result?.status === "success" ? (result.result as bigint) : null;
      });
    } catch {
      batch.forEach((token) => {
        balances[key(token.token)] = null;
      });
    }
  }

  if (nativeToken) balances[key(nativeToken.token)] = await nativeBalance;
  return balances;
}

export function orderSourceTokensByBalance(tokens: readonly SourceToken[], balances: SourceTokenBalances) {
  const nativeAddress = key(NATIVE_TOKEN_ADDRESS);
  const rank = (token: SourceToken) => {
    const balance = balances[key(token.token)];
    if (balance === null || balance === undefined) return 0;
    if (balance === 0n) return 1;
    return key(token.token) === nativeAddress ? 3 : 2;
  };
  return [...tokens].sort((left, right) => rank(right) - rank(left));
}

export function hasUnknownSourceTokenBalances(tokens: readonly SourceToken[], balances: SourceTokenBalances) {
  return tokens.some((token) => balances[key(token.token)] == null);
}

export function sourceTokenBalance(balances: SourceTokenBalances | undefined, token: string) {
  return balances?.[key(token)];
}

export function visibleSourceTokens(
  tokens: readonly SourceToken[],
  balances: SourceTokenBalances | undefined,
  showAll: boolean,
  selectedToken = "",
) {
  if (showAll) return nativeTokenFirst(tokens);
  const ordered = balances ? orderSourceTokensByBalance(tokens, balances) : nativeTokenFirst(tokens);
  if (!balances || hasUnknownSourceTokenBalances(tokens, balances)) return ordered;
  return ordered.filter(
    (token) => (sourceTokenBalance(balances, token.token) ?? 0n) > 0n || key(token.token) === key(selectedToken),
  );
}

export function nativeTokenFirst(tokens: readonly SourceToken[]) {
  const nativeAddress = key(NATIVE_TOKEN_ADDRESS);
  return [...tokens].sort(
    (left, right) => Number(key(right.token) === nativeAddress) - Number(key(left.token) === nativeAddress),
  );
}
