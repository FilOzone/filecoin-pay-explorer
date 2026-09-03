import { type Address, erc20Abi, formatUnits } from "viem";
import { NATIVE_USDC_BY_CHAIN } from "@/components/UserConsole/privy-funding";
import { parseFundingAmount } from "./funding-runway";
import { isNativeToken } from "./guided-top-up";
import { isUsdcLikeSymbol } from "./squid-deposit-route";
import { isStablecoinSymbol, type PaymentToken } from "./squid-payment-tokens";

/** One token on one source network, with the paying wallet's balance of it. */
export type PaymentSource = { chainId: number; token: PaymentToken; balance: bigint };

/** What the picker needs to name a source: the network and which of its tokens. */
export type PaymentSourceChoice = { chainId: number; token: string };

const COMMON_DECIMALS = 18;
const STABLE_FRACTION_DIGITS = 2;
const VOLATILE_FRACTION_DIGITS = 4;

export type BalanceReader = {
  getBalance: (args: { address: Address }) => Promise<bigint>;
  multicall: (args: {
    allowFailure: true;
    contracts: { abi: typeof erc20Abi; address: Address; args: readonly [Address]; functionName: "balanceOf" }[];
  }) => Promise<readonly { status: "success" | "failure"; result?: unknown }[]>;
};

/**
 * Reads the wallet's balance of every listed token on one network: the ERC-20s
 * in a single multicall, the native coin beside it.
 */
export async function readPaymentSources({
  chainId,
  client,
  owner,
  tokens,
}: {
  chainId: number;
  client: BalanceReader;
  owner: Address;
  tokens: readonly PaymentToken[];
}): Promise<PaymentSource[]> {
  if (tokens.length === 0) return [];
  const erc20s = tokens.filter((token) => !isNativeToken(token.token));
  const [results, native] = await Promise.all([
    erc20s.length > 0
      ? client.multicall({
          allowFailure: true,
          contracts: erc20s.map((token) => ({
            abi: erc20Abi,
            address: token.token,
            args: [owner] as const,
            functionName: "balanceOf" as const,
          })),
        })
      : Promise.resolve([]),
    erc20s.length < tokens.length ? client.getBalance({ address: owner }).catch(() => 0n) : Promise.resolve(0n),
  ]);
  const balanceOf = new Map(
    erc20s.map((token, index) => {
      const result = results[index];
      return [token.token, result?.status === "success" && typeof result.result === "bigint" ? result.result : 0n];
    }),
  );
  return tokens.map((token) => ({
    balance: isNativeToken(token.token) ? native : (balanceOf.get(token.token) ?? 0n),
    chainId,
    token,
  }));
}

/** Balances scaled to a common precision, so tokens with 6 and 18 decimals compare. */
export function normalizeSourceBalance({ balance, token }: PaymentSource): bigint {
  return balance * 10n ** BigInt(COMMON_DECIMALS - token.decimals);
}

/** Dollar value of the balance: the catalog price, or a dollar a unit for a stablecoin it did not price. */
export function getSourceUsdValue({ balance, token }: PaymentSource): number {
  const price = token.usdPrice ?? (isStablecoinSymbol(token.symbol) ? 1 : 0);
  return Number(formatUnits(balance, token.decimals)) * price;
}

const compareBigint = (a: bigint, b: bigint) => (a > b ? 1 : a < b ? -1 : 0);

/**
 * USDC first, largest balance first, since that is what most wallets pay with;
 * then every other token by dollar value. Ties keep their order.
 */
export function rankPaymentSources(sources: readonly PaymentSource[]): PaymentSource[] {
  return [...sources].sort((a, b) => {
    const usdcFirst = Number(isUsdcLikeSymbol(b.token.symbol)) - Number(isUsdcLikeSymbol(a.token.symbol));
    if (usdcFirst !== 0) return usdcFirst;
    if (!isUsdcLikeSymbol(a.token.symbol)) {
      const byValue = getSourceUsdValue(b) - getSourceUsdValue(a);
      if (byValue !== 0) return byValue > 0 ? 1 : -1;
    }
    return compareBigint(normalizeSourceBalance(b), normalizeSourceBalance(a));
  });
}

export function isFundedSource(source: PaymentSource): boolean {
  return source.balance > 0n;
}

/** The best-ranked source that holds anything, if one does. */
export function pickDefaultPaymentSource(sources: readonly PaymentSource[]): PaymentSource | undefined {
  return rankPaymentSources(sources).find(isFundedSource);
}

/**
 * The best-ranked source of the same token that covers the typed amount. An
 * amount is typed in one token, so only that token's other networks can stand in.
 */
export function findPaymentSourceCovering(
  sources: readonly PaymentSource[],
  amount: string,
  symbol: string,
): PaymentSource | undefined {
  return rankPaymentSources(sources).find((source) => {
    if (source.token.symbol.toLowerCase() !== symbol.toLowerCase()) return false;
    const parsed = parseFundingAmount(amount, source.token.decimals);
    return parsed !== null && source.balance >= parsed;
  });
}

export function isSamePaymentSource(source: PaymentSource, choice: PaymentSourceChoice | undefined): boolean {
  return (
    !!choice && source.chainId === choice.chainId && source.token.token.toLowerCase() === choice.token.toLowerCase()
  );
}

/** Two decimals for a stablecoin, four for anything else; dust that would round to nothing reads as less than that. */
export function formatSourceBalance({ balance, token }: PaymentSource): string {
  const digits = isStablecoinSymbol(token.symbol) ? STABLE_FRACTION_DIGITS : VOLATILE_FRACTION_DIGITS;
  const [whole, fraction = ""] = formatUnits(balance, token.decimals).split(".");
  const trimmed = fraction.replace(/0+$/, "").slice(0, digits);
  if (whole === "0" && Number(trimmed || "0") === 0 && balance > 0n) return `<0.${"0".repeat(digits - 1)}1`;
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** "≈ $180.25" for a priced token that is not itself a dollar; nothing otherwise. */
export function formatSourceUsdValue(source: PaymentSource): string | undefined {
  if (isStablecoinSymbol(source.token.symbol) || source.token.usdPrice === undefined) return undefined;
  const value = getSourceUsdValue(source);
  if (value > 0 && value < 0.01) return "≈ <$0.01";
  return `≈ $${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export type PaymentSourceOption = PaymentSourceChoice & { label: string; value: string };

export function toPaymentSourceValue({ chainId, token }: PaymentSourceChoice): string {
  return `${chainId}:${token}`;
}

export function parsePaymentSourceValue(value: string): PaymentSourceChoice {
  const [chainId, token = ""] = value.split(":");
  return { chainId: Number(chainId), token };
}

/** The funded pairs the picker offers, best first; nothing else is listed. */
export function fundedPaymentSourceOptions({
  chains,
  sources,
}: {
  chains: readonly { id: number; name: string }[];
  sources: readonly PaymentSource[];
}): PaymentSourceOption[] {
  const chainName = (chainId: number) => chains.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;
  const symbolLabel = (source: PaymentSource) => {
    // Only when two listed tokens on a network share a symbol does the address tell them apart.
    const twins = sources.filter((s) => s.chainId === source.chainId && s.token.symbol === source.token.symbol);
    return twins.length > 1 ? `${source.token.symbol} (${shortAddress(source.token.token)})` : source.token.symbol;
  };
  return rankPaymentSources(sources)
    .filter(isFundedSource)
    .map((source) => {
      const usd = formatSourceUsdValue(source);
      return {
        chainId: source.chainId,
        label: `${chainName(source.chainId)} · ${symbolLabel(source)} · ${formatSourceBalance(source)}${usd ? ` (${usd})` : ""}`,
        token: source.token.token,
        value: toPaymentSourceValue({ chainId: source.chainId, token: source.token.token }),
      };
    });
}

/**
 * The token a card purchase delivers on a network: the onramp only issues
 * native USDC, so it is Squid's plain USDC listing when the scan has one, else
 * the network's known native USDC, and nothing on a network the onramp lacks.
 */
export function findCardUsdcToken(sources: readonly PaymentSource[], chainId: number): PaymentToken | undefined {
  const listed = sources.find((source) => source.chainId === chainId && source.token.symbol.toUpperCase() === "USDC");
  if (listed) return listed.token;
  const native = NATIVE_USDC_BY_CHAIN[chainId];
  return native ? { chainId, decimals: 6, symbol: "USDC", token: native } : undefined;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
