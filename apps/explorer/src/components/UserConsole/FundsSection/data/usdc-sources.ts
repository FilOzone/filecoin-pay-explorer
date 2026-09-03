import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import { type Address, erc20Abi, formatUnits } from "viem";
import { NATIVE_USDC_BY_CHAIN } from "@/components/UserConsole/privy-funding";
import { parseFundingAmount } from "./funding-runway";

/** One USDC token on one source network, with the paying wallet's balance of it. */
export type UsdcSource = { chainId: number; token: SourceToken; balance: bigint };

/** What the picker needs to name a source: the network and, among several USDC tokens, which one. */
export type UsdcSourceChoice = { chainId: number; token: string };

const COMMON_DECIMALS = 18;

export type BalanceReader = {
  multicall: (args: {
    allowFailure: true;
    contracts: { abi: typeof erc20Abi; address: Address; args: readonly [Address]; functionName: "balanceOf" }[];
  }) => Promise<readonly { status: "success" | "failure"; result?: unknown }[]>;
};

/** Reads the wallet's balance of every listed token on one network in a single multicall. */
export async function readUsdcSources({
  chainId,
  client,
  owner,
  tokens,
}: {
  chainId: number;
  client: BalanceReader;
  owner: Address;
  tokens: readonly SourceToken[];
}): Promise<UsdcSource[]> {
  if (tokens.length === 0) return [];
  const results = await client.multicall({
    allowFailure: true,
    contracts: tokens.map((token) => ({
      abi: erc20Abi,
      address: token.token,
      args: [owner] as const,
      functionName: "balanceOf" as const,
    })),
  });
  return tokens.map((token, index) => {
    const result = results[index];
    const balance = result?.status === "success" && typeof result.result === "bigint" ? result.result : 0n;
    return { balance, chainId, token };
  });
}

/** Balances scaled to a common precision, so USDC with 6 and 18 decimals compare. */
export function normalizeUsdcBalance({ balance, token }: UsdcSource): bigint {
  return balance * 10n ** BigInt(COMMON_DECIMALS - token.decimals);
}

/** Largest balance first; sources with the same balance keep their order. */
export function rankUsdcSources(sources: readonly UsdcSource[]): UsdcSource[] {
  return [...sources].sort((a, b) => {
    const difference = normalizeUsdcBalance(b) - normalizeUsdcBalance(a);
    return difference > 0n ? 1 : difference < 0n ? -1 : 0;
  });
}

export function isFundedUsdcSource(source: UsdcSource): boolean {
  return source.balance > 0n;
}

/** The source holding the most USDC, if any holds some. */
export function pickDefaultUsdcSource(sources: readonly UsdcSource[]): UsdcSource | undefined {
  return rankUsdcSources(sources).find(isFundedUsdcSource);
}

/** The source holding the most USDC among those that cover the typed amount. */
export function findUsdcSourceCovering(sources: readonly UsdcSource[], amount: string): UsdcSource | undefined {
  return rankUsdcSources(sources).find((source) => {
    const parsed = parseFundingAmount(amount, source.token.decimals);
    return parsed !== null && source.balance >= parsed;
  });
}

export function isSameUsdcSource(source: UsdcSource, choice: UsdcSourceChoice | undefined): boolean {
  return (
    !!choice && source.chainId === choice.chainId && source.token.token.toLowerCase() === choice.token.toLowerCase()
  );
}

/** At most two decimals; dust that would round to nothing reads as less than a cent. */
export function formatUsdcBalance({ balance, token }: UsdcSource): string {
  const [whole, fraction = ""] = formatUnits(balance, token.decimals).split(".");
  const trimmed = fraction.replace(/0+$/, "").slice(0, 2);
  if (whole === "0" && Number(trimmed || "0") === 0 && balance > 0n) return "<0.01";
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export type UsdcSourceOption = UsdcSourceChoice & { label: string; value: string };

export function toUsdcSourceValue({ chainId, token }: UsdcSourceChoice): string {
  return `${chainId}:${token}`;
}

export function parseUsdcSourceValue(value: string): UsdcSourceChoice {
  const [chainId, token = ""] = value.split(":");
  return { chainId: Number(chainId), token };
}

/** The funded pairs the picker offers, largest balance first; nothing else is listed. */
export function fundedUsdcSourceOptions({
  chains,
  sources,
}: {
  chains: readonly { id: number; name: string }[];
  sources: readonly UsdcSource[];
}): UsdcSourceOption[] {
  const chainName = (chainId: number) => chains.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;
  const symbolLabel = (source: UsdcSource) => {
    // Only when two listed tokens on a network share a symbol does the address tell them apart.
    const twins = sources.filter((s) => s.chainId === source.chainId && s.token.symbol === source.token.symbol);
    return twins.length > 1 ? `${source.token.symbol} (${shortAddress(source.token.token)})` : source.token.symbol;
  };
  return rankUsdcSources(sources)
    .filter(isFundedUsdcSource)
    .map((source) => ({
      chainId: source.chainId,
      label: `${chainName(source.chainId)} · ${symbolLabel(source)} · ${formatUsdcBalance(source)}`,
      token: source.token.token,
      value: toUsdcSourceValue({ chainId: source.chainId, token: source.token.token }),
    }));
}

/**
 * The token a card purchase delivers on a network: the onramp only issues
 * native USDC, so it is Squid's plain USDC listing when the scan has one, else
 * the network's known native USDC, and nothing on a network the onramp lacks.
 */
export function findCardUsdcToken(sources: readonly UsdcSource[], chainId: number): UsdcSource["token"] | undefined {
  const listed = sources.find((source) => source.chainId === chainId && source.token.symbol.toUpperCase() === "USDC");
  if (listed) return listed.token;
  const native = NATIVE_USDC_BY_CHAIN[chainId];
  return native ? { chainId, decimals: 6, symbol: "USDC", token: native } : undefined;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
