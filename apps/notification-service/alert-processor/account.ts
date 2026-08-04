import { getAccountSummary } from "@filoz/synapse-core/pay";
import { TIME_CONSTANTS } from "@filoz/synapse-core/utils";
import { type Address, type Chain, createPublicClient, http, type PublicClient, type Transport } from "viem";
import type { AlertLevel } from "../shared/alert-levels";
import { getChain, type Network } from "../shared/chain";

/** A read-only client bound to a concrete chain (viem widens `chain` to optional otherwise). */
export type ReadClient = PublicClient<Transport, Chain>;

/** The bindings `createReadClient` needs — a subset of the worker `Env`. */
export type ReadClientConfig = {
  /** JSON-RPC endpoint for the target network (a per-worker secret). */
  rpcUrl: string;
  network: Network;
};

/** Runway-based health tiers: "healthy" (no alert) plus the actionable alert levels. */
export type HealthTier = "healthy" | AlertLevel;

/** Runway thresholds in whole days. A tier fires when runway is strictly below its value. */
export type HealthThresholds = {
  warning: number;
  critical: number;
  emergency: number;
};

/**
 * The subset of the Synapse account summary the health derivation needs.
 */
export type AccountSummary = {
  /** Epochs until the account enters deficit; `maxUint256` when nothing is spent, `0n` when already in deficit. */
  runwayInEpochs: bigint;
  /** Aggregate per-epoch lockup rate; `0n` means no active storage spend. */
  lockupRatePerEpoch: bigint;
  /** Outstanding obligation the account can't cover; `> 0n` means it is already in deficit. */
  debt: bigint;
  /** The epoch the summary was evaluated at. */
  epoch: bigint;
};

export type AccountHealth = {
  tier: HealthTier;
  /** Whole days of runway (floored). `Infinity` when there is no active spend. */
  runwayDays: number;
  /** Absolute epoch funds run out (`epoch + runwayInEpochs`); `null` when there is no active spend. */
  fundedUntilEpoch: bigint | null;
};

export const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;

/**
 * Default runway thresholds (days) — the single source of truth for the tier
 * cut-offs.
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  warning: 30,
  critical: 7,
  emergency: 3,
};

/**
 * Derives account health from a Synapse account summary.
 *
 * Runway comes straight from the SDK's `runwayInEpochs` (reserve-aware, the same
 * value the filecoin-pin `payments status` command reports).
 * Tiers are compared in epoch-space so the day-threshold
 * boundaries stay exact rather than being distorted by day truncation.
 */
export function deriveAccountHealth(summary: AccountSummary, thresholds: HealthThresholds): AccountHealth {
  // Debt means the account is already in deficit regardless of spend rate or runway.
  if (summary.debt > 0n) {
    return { tier: "emergency", runwayDays: 0, fundedUntilEpoch: summary.epoch };
  }

  // No active storage spend → nothing can run out; runway is irrelevant.
  if (summary.lockupRatePerEpoch === 0n) {
    return { tier: "healthy", runwayDays: Number.POSITIVE_INFINITY, fundedUntilEpoch: null };
  }

  // Active spend with no remaining runway → funds exhausted, termination imminent.
  if (summary.runwayInEpochs === 0n) {
    return { tier: "emergency", runwayDays: 0, fundedUntilEpoch: summary.epoch };
  }

  const runway = summary.runwayInEpochs;
  const health = {
    runwayDays: Number(runway / EPOCHS_PER_DAY),
    fundedUntilEpoch: summary.epoch + runway,
  };

  if (runway < BigInt(thresholds.emergency) * EPOCHS_PER_DAY) return { tier: "emergency", ...health };
  if (runway < BigInt(thresholds.critical) * EPOCHS_PER_DAY) return { tier: "critical", ...health };
  if (runway < BigInt(thresholds.warning) * EPOCHS_PER_DAY) return { tier: "warning", ...health };
  return { tier: "healthy", ...health };
}

/**
 * A read-only viem client for the configured network. One client serves a whole
 * queue batch — account reads need no signer, so no private key is involved.
 */
export function createReadClient({ rpcUrl, network }: ReadClientConfig): ReadClient {
  return createPublicClient({ chain: getChain(network), transport: http(rpcUrl) });
}

/**
 * Reads an arbitrary wallet's Filecoin Pay account summary and narrows it to the
 * fields the health derivation needs. The network and FilecoinPay contract are
 * resolved from the client's chain, so no separate network argument is needed.
 */
export async function readAccountSummary(client: ReadClient, walletAddress: string): Promise<AccountSummary> {
  const summary = await getAccountSummary(client, { address: walletAddress as Address });
  return {
    runwayInEpochs: summary.runwayInEpochs,
    lockupRatePerEpoch: summary.lockupRatePerEpoch,
    debt: summary.debt,
    epoch: summary.epoch,
  };
}

/**
 * Reads a wallet's account summary and derives its health tier in one call.
 */
export async function accountHealth(
  client: ReadClient,
  walletAddress: string,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): Promise<AccountHealth> {
  const summary = await readAccountSummary(client, walletAddress);
  return deriveAccountHealth(summary, thresholds);
}
