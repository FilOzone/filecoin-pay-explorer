import { EPOCH_DURATION, UNLIMITED_THRESHOLD } from "./constants";

export const formatPercentage = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const formatDate = (timestamp: bigint): string =>
  new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function formatCompactNumber(value: number | string | bigint, decimals: number = 2) {
  value = Number(value);
  const i = value < 1000 ? 0 : Math.floor(Math.log(value) / Math.log(1000));
  const sizes = ["", "K", "M", "B", "T", "Qa", "Qi"];
  return `${(value / 1000 ** i).toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")} ${sizes[i]}`;
}

export function formatToken(
  value: number | string | bigint,
  tokenDecimals: number | bigint = 18,
  symbol: string = "",
  decimals: number = 2,
) {
  const divisor = 10 ** Number(tokenDecimals);
  const unitValue = Number(value) / divisor;
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

export const isUnlimitedValue = (value: number | string | bigint): boolean => {
  try {
    const bigIntValue = BigInt(value);
    return bigIntValue > UNLIMITED_THRESHOLD;
  } catch {
    return false;
  }
};

export const epochToDate = (
  futureEpoch: bigint | number,
  currentEpoch: bigint | number,
  epochDuration: number = 30,
): Date => {
  const future = BigInt(futureEpoch);
  const current = BigInt(currentEpoch);
  const epochsRemaining = future - current;
  const secondsRemaining = Number(epochsRemaining) * epochDuration;
  const futureTimestamp = Date.now() + secondsRemaining * 1000;
  return new Date(futureTimestamp);
};

export const formatFutureTimestamp = (futureTimestamp: bigint | number): string => {
  const date = new Date(Number(futureTimestamp) * 1_000);
  const now = Date.now();
  const futureTime = date.getTime();
  const diffMs = futureTime - now;

  if (diffMs < 0) {
    return "Expired";
  }

  if (diffMs < 60000) {
    return "Now";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears >= 10) {
    return `~${diffYears} years`;
  }

  if (diffDays > 1) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: diffDays > 365 ? "numeric" : undefined,
    });
  } else if (diffHours > 1) {
    return `${diffHours}h ${diffMinutes % 60}m`;
  } else {
    return `${diffMinutes}m`;
  }
};

export const formatEpochDuration = (epochs: bigint | number, epochDuration: number = EPOCH_DURATION): string => {
  const totalSeconds = Number(epochs) * epochDuration;
  if (totalSeconds === 0) return "None";
  if (totalSeconds < 60) return "<1m";
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`;
  if (hours >= 1) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};
