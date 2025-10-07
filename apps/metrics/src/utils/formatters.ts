export const formatPercentage = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const formatDate = (timestamp: bigint): string =>
  new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export function formatCompactNumber(value: number | string | bigint, decimals: number = 2) {
  value = Number(value);
  const i = value < 1000 ? 0 : Math.floor(Math.log(value) / Math.log(1000));
  const sizes = ["", "K", "M", "B", "Qa", "Qi"];
  return `${(value / 1000 ** i).toFixed(decimals).replace(/\.?0+$/, "")} ${sizes[i]}`;
}

export function formatToken(
  value: number | string | bigint,
  tokenDecimals: number | bigint = 18,
  symbol: string = "",
  decimals: number = 2,
) {
  const divisor = BigInt(10) ** BigInt(tokenDecimals);
  const unitValue = BigInt(value) / divisor;
  return `${formatCompactNumber(unitValue, decimals)} ${symbol}`;
}

export const formatFIL = (attoFil: string | bigint) => {
  if (!attoFil || attoFil === "0") return "0 FIL";

  const value = BigInt(attoFil);
  const filDivisor = BigInt(10) ** BigInt(18);
  const filValue = value / filDivisor;

  // If >= 1 FIL, show as FIL with compact notation
  if (filValue >= 1) {
    return `${formatCompactNumber(filValue, 1)} FIL`;
  }

  // For fractional FIL (>= 0.001 FIL), show with more decimals
  const filValueWithDecimals = Number(value) / Number(filDivisor);
  if (filValueWithDecimals >= 0.001) {
    return `${filValueWithDecimals.toFixed(3)} FIL`;
  }

  // For smaller amounts, use appropriate smaller units
  const units = [
    { name: "nanoFIL", decimals: 9 },
    { name: "picoFIL", decimals: 6 },
    { name: "femtoFIL", decimals: 3 },
    { name: "attoFIL", decimals: 0 },
  ];

  for (const unit of units) {
    const divisor = BigInt(10) ** BigInt(unit.decimals);
    const unitValue = value / divisor;

    if (unitValue >= 1) {
      // Use compact formatting for smaller units
      return `${formatCompactNumber(unitValue, 2)} ${unit.name}`;
    }
  }

  return "0 FIL";
};

export function YAxisTickFormatter(value: number, isToken: boolean, decimals: number = 0) {
  return isToken
    ? (() => {
        const divisor = BigInt(10) ** BigInt(decimals);
        const unitValue = BigInt(value) / divisor;
        return `${formatCompactNumber(unitValue, 0)}`;
      })()
    : formatCompactNumber(value, decimals);
}
