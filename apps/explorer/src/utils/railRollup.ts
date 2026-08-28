import type { Rail } from "@filecoin-pay/types";

/** Locked console convention: 2,880 epochs/day × 30 days. Matches the value FWSS's getServicePrice() reports on mainnet. */
export const EPOCHS_PER_MONTH = 86_400n;

export type ServiceRollup = {
  operatorAddress: string;
  railCount: number;
  activeRailCount: number;
  /** Terminated but not finalized: locked funds waiting to be reclaimed by finalizing. */
  terminatedRailCount: number;
  /** Token base units per month across active rails. */
  monthlyRate: bigint;
  /** All-time one-time payments (operation fees + usage) across the operator's rails. */
  oneTimeTotal: bigint;
  /** Streaming lockup (rate × lockupPeriod) across active rails; fixed lockup not included. */
  streamingLockup: bigint;
  tokenDecimals: number;
  tokenSymbol: string;
};

/**
 * Groups the rails an account PAYS on by operator — the console's "service"
 * granularity (service = operator of the rail, ruling 2026-08-18). Payee-side
 * rails are excluded: this feeds spend views, not income views.
 *
 * Token fields come from each group's first rail: FWSS rails are all USDFC
 * today, and a mixed-token operator would need a per-token split anyway.
 */
export const rollupRailsByOperator = (rails: Rail[], payerAddress: string): ServiceRollup[] => {
  const payer = payerAddress.toLowerCase();
  const groups = new Map<string, ServiceRollup>();

  for (const rail of rails) {
    if (rail.payer.address.toLowerCase() !== payer) continue;
    const operator = rail.operator.address.toLowerCase();

    let group = groups.get(operator);
    if (!group) {
      group = {
        operatorAddress: operator,
        railCount: 0,
        activeRailCount: 0,
        terminatedRailCount: 0,
        monthlyRate: 0n,
        oneTimeTotal: 0n,
        streamingLockup: 0n,
        tokenDecimals: Number(rail.token.decimals ?? 18),
        tokenSymbol: rail.token.symbol ?? "",
      };
      groups.set(operator, group);
    }

    group.railCount += 1;
    group.oneTimeTotal += BigInt(rail.totalOneTimePaymentAmount ?? 0);
    if (rail.state === "ACTIVE") {
      group.activeRailCount += 1;
      const rate = BigInt(rail.paymentRate ?? 0);
      group.monthlyRate += rate * EPOCHS_PER_MONTH;
      group.streamingLockup += rate * BigInt(rail.lockupPeriod ?? 0);
    } else if (rail.state === "TERMINATED") {
      group.terminatedRailCount += 1;
    }
  }

  return [...groups.values()].sort((a, b) => (b.monthlyRate > a.monthlyRate ? 1 : -1));
};
