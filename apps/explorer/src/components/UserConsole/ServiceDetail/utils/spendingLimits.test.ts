import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import type { OperatorApprovalState } from "@/hooks/useOperatorApproval";
import {
  formatLockupLimit,
  formatPeriodLimit,
  formatRateLimit,
  type LimitsForm,
  limitsForm,
  parseLimitsForm,
} from "./spendingLimits";

const { EPOCHS_PER_DAY, EPOCHS_PER_MONTH } = TIME_CONSTANTS;
const DECIMALS = 18;
const TOKEN = 10n ** 18n;

// About 10 tokens a month, but not the per-epoch rate that "10" parses back to, as real rates rarely are.
const RATE = (10n * TOKEN) / EPOCHS_PER_MONTH + 7n;

const current: OperatorApprovalState = {
  isApproved: true,
  rateAllowance: RATE,
  lockupAllowance: 50n * TOKEN,
  maxLockupPeriod: 30n * EPOCHS_PER_DAY,
  rateUsage: 0n,
  lockupUsage: 0n,
};

const edit = (changes: Partial<LimitsForm>, from = current) => ({ ...limitsForm(from, DECIMALS), ...changes });

describe("limitsForm", () => {
  it("starts from readable figures in the form's units", () => {
    expect(limitsForm(current, DECIMALS)).toEqual({
      rate: { text: "10", unlimited: false },
      lockup: { text: "50", unlimited: false },
      period: { text: "30", unlimited: false },
    });
  });

  it("starts unlimited values as unlimited", () => {
    const unlimited = {
      ...current,
      rateAllowance: maxUint256,
      lockupAllowance: maxUint256,
      maxLockupPeriod: maxUint256,
    };

    expect(limitsForm(unlimited, DECIMALS)).toEqual({
      rate: { text: "", unlimited: true },
      lockup: { text: "", unlimited: true },
      period: { text: "", unlimited: true },
    });
  });
});

describe("parseLimitsForm", () => {
  it("keeps the exact on-chain value of every field left as prefilled", () => {
    // The rate prefills as "10", which parses back to a different per-epoch rate.
    expect(parseLimitsForm(edit({ lockup: { text: "20", unlimited: false } }), current, DECIMALS)).toEqual({
      status: "ready",
      terms: { rateAllowance: RATE, lockupAllowance: 20n * TOKEN, maxLockupPeriod: 30n * EPOCHS_PER_DAY },
      belowUsage: false,
    });
  });

  it("converts a monthly rate up to whole base units per epoch and days to epochs", () => {
    const form = edit({ rate: { text: "1", unlimited: false }, period: { text: "7", unlimited: false } });

    expect(parseLimitsForm(form, current, DECIMALS)).toEqual({
      status: "ready",
      terms: {
        rateAllowance: (TOKEN + EPOCHS_PER_MONTH - 1n) / EPOCHS_PER_MONTH,
        lockupAllowance: 50n * TOKEN,
        maxLockupPeriod: 7n * EPOCHS_PER_DAY,
      },
      belowUsage: false,
    });
  });

  it("signs the maximum for an unlimited field", () => {
    const update = parseLimitsForm(edit({ rate: { text: "10", unlimited: true } }), current, DECIMALS);

    expect(update).toMatchObject({ status: "ready", terms: { rateAllowance: maxUint256 } });
  });

  it("parses large amounts exactly, past Number's precision", () => {
    const update = parseLimitsForm(
      edit({ lockup: { text: "123456789012345678.123456789012345678", unlimited: false } }),
      current,
      DECIMALS,
    );

    expect(update).toMatchObject({ terms: { lockupAllowance: 123456789012345678123456789012345678n } });
  });

  it.each([
    ["an empty amount", { lockup: { text: "", unlimited: false } }],
    ["an exponent", { lockup: { text: "1e5", unlimited: false } }],
    ["a negative amount", { rate: { text: "-1", unlimited: false } }],
    ["a fractional number of days", { period: { text: "1.5", unlimited: false } }],
    ["more than the contract can hold", { lockup: { text: `${maxUint256}`, unlimited: false } }],
  ])("rejects %s", (_name, changes) => {
    expect(parseLimitsForm(edit(changes), current, DECIMALS)).toEqual({ status: "invalid" });
  });

  it("reports an untouched form as unchanged", () => {
    expect(parseLimitsForm(edit({}), current, DECIMALS)).toEqual({ status: "unchanged" });
  });

  it("approves a revoked service again even with its old limits", () => {
    const revoked = { ...current, isApproved: false };

    expect(parseLimitsForm(edit({}, revoked), revoked, DECIMALS)).toEqual({
      status: "ready",
      terms: { rateAllowance: RATE, lockupAllowance: 50n * TOKEN, maxLockupPeriod: 30n * EPOCHS_PER_DAY },
      belowUsage: false,
    });
  });

  it.each([
    ["rate", { ...current, rateUsage: RATE }, { rate: { text: "5", unlimited: false } }],
    ["lockup", { ...current, lockupUsage: 40n * TOKEN }, { lockup: { text: "30", unlimited: false } }],
  ])("flags a %s below what the service already uses", (_name, inUse, changes) => {
    expect(parseLimitsForm(edit(changes, inUse), inUse, DECIMALS)).toMatchObject({
      status: "ready",
      belowUsage: true,
    });
  });

  it("does not flag a limit exactly at usage", () => {
    const inUse = { ...current, lockupUsage: 30n * TOKEN };

    expect(parseLimitsForm(edit({ lockup: { text: "30", unlimited: false } }, inUse), inUse, DECIMALS)).toMatchObject({
      belowUsage: false,
    });
  });
});

describe("limit labels", () => {
  it("labels unlimited values explicitly", () => {
    expect([
      formatRateLimit(maxUint256, DECIMALS, "USDFC"),
      formatLockupLimit(maxUint256, DECIMALS, "USDFC"),
      formatPeriodLimit(maxUint256),
    ]).toEqual(["Unlimited", "Unlimited", "Unlimited"]);
  });

  it("shows finite values in the form's units", () => {
    expect([
      formatRateLimit(RATE, DECIMALS, "USDFC"),
      formatLockupLimit(50n * TOKEN, DECIMALS, "USDFC"),
      formatPeriodLimit(30n * EPOCHS_PER_DAY),
      formatPeriodLimit(EPOCHS_PER_DAY),
      formatPeriodLimit(EPOCHS_PER_DAY / 2n),
    ]).toEqual(["10.000 USDFC / month", "50.000 USDFC", "30 days", "1 day", "0.5 days"]);
  });
});
