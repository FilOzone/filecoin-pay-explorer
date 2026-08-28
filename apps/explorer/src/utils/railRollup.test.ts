import type { Rail } from "@filecoin-pay/types";
import { describe, expect, it } from "vitest";
import { EPOCHS_PER_MONTH, rollupRailsByOperator } from "./railRollup";

const PAYER = "0xAAaa000000000000000000000000000000000001";
const OPERATOR = "0xbbbb000000000000000000000000000000000002";

// Only the fields rollupRailsByOperator reads; the generated Rail type carries
// the full subgraph entity graph, irrelevant to these semantics.
const rail = (overrides: Record<string, unknown> = {}): Rail =>
  ({
    id: "0x01",
    state: "ACTIVE",
    paymentRate: 100n,
    lockupPeriod: 2880n,
    totalOneTimePaymentAmount: 5n,
    payer: { address: PAYER },
    payee: { address: "0xcccc000000000000000000000000000000000003" },
    operator: { address: OPERATOR },
    token: { decimals: 18, symbol: "USDFC" },
    ...overrides,
  }) as unknown as Rail;

describe("rollupRailsByOperator", () => {
  it("excludes rails where the account is payee, not payer", () => {
    const rails = [rail(), rail({ payer: { address: "0xdddd000000000000000000000000000000000004" } })];
    const rollups = rollupRailsByOperator(rails, PAYER);
    expect(rollups).toHaveLength(1);
    expect(rollups[0].railCount).toBe(1);
  });

  it("counts only ACTIVE rails toward monthly rate and lockup, but all rails toward one-time totals", () => {
    const rails = [rail(), rail({ id: "0x02", state: "TERMINATED", totalOneTimePaymentAmount: 7n })];
    const [rollup] = rollupRailsByOperator(rails, PAYER);
    expect(rollup.railCount).toBe(2);
    expect(rollup.activeRailCount).toBe(1);
    expect(rollup.terminatedRailCount).toBe(1);
    expect(rollup.monthlyRate).toBe(100n * EPOCHS_PER_MONTH);
    expect(rollup.streamingLockup).toBe(100n * 2880n);
    expect(rollup.oneTimeTotal).toBe(12n);
  });

  it("handles subgraph string scalars at runtime despite bigint typings", () => {
    const rails = [rail({ paymentRate: "100", lockupPeriod: "2880", totalOneTimePaymentAmount: "5" })];
    const [rollup] = rollupRailsByOperator(rails, PAYER);
    expect(rollup.monthlyRate).toBe(100n * EPOCHS_PER_MONTH);
    expect(rollup.oneTimeTotal).toBe(5n);
  });

  it("matches payer addresses case-insensitively", () => {
    const [rollup] = rollupRailsByOperator([rail()], PAYER.toLowerCase());
    expect(rollup.operatorAddress).toBe(OPERATOR.toLowerCase());
    expect(rollup.railCount).toBe(1);
  });
});
