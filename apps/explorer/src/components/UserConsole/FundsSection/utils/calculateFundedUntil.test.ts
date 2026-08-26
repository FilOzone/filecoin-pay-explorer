import type { UserToken } from "@filecoin-pay/types";
import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { EPOCH_DURATION } from "@/utils/constants";
import { calculateFundedUntil } from "./calculateFundedUntil";

/**
 * Characterization tests. This derivation predates the funds overview and was
 * moved here unchanged, so these pin the behaviour that already shipped rather
 * than asserting the formula is the right one.
 */

const EPOCH = BigInt(EPOCH_DURATION);
const SETTLED_EPOCH = 1000n;
const SETTLED_TIMESTAMP = 1_700_000_000n;

/** Only the five fields the derivation reads; the rest of UserToken is irrelevant here. */
const userToken = (fields: { funds: bigint; lockupCurrent: bigint; lockupRate: bigint }): UserToken =>
  ({
    funds: fields.funds,
    lockupCurrent: fields.lockupCurrent,
    lockupRate: fields.lockupRate,
    lockupLastSettledUntilEpoch: SETTLED_EPOCH,
    lockupLastSettledUntilTimestamp: SETTLED_TIMESTAMP,
  }) as UserToken;

/** Timestamp `epochs` after the last settled point. */
const at = (epochs: bigint) => SETTLED_TIMESTAMP + epochs * EPOCH;

describe("calculateFundedUntil", () => {
  describe("no active spend", () => {
    it("reports an unbounded funded-until and no debt when the rate is zero", () => {
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 0n }), at(500n));

      expect(result).toEqual({
        availableFunds: 60n,
        debt: 0n,
        fundedUntilTimestamp: maxUint256,
        simulatedLockupCurrent: 40n,
      });
    });

    it("leaves lockup unchanged however far time has advanced", () => {
      const token = userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 0n });

      expect(calculateFundedUntil(token, at(1n)).simulatedLockupCurrent).toBe(40n);
      expect(calculateFundedUntil(token, at(1_000_000n)).simulatedLockupCurrent).toBe(40n);
    });
  });

  describe("active spend, still solvent", () => {
    it("rolls lockup forward at the rate and reports the remaining balance", () => {
      // 100 funds, 40 locked, 2/epoch: 30 epochs of runway from the settled point.
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n }), at(10n));

      expect(result).toEqual({
        availableFunds: 40n,
        debt: 0n,
        fundedUntilTimestamp: at(30n),
        simulatedLockupCurrent: 60n,
      });
    });

    it("truncates a partial epoch rather than rounding up", () => {
      const token = userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n });

      // One second short of the 10th epoch still counts as 9 elapsed.
      expect(calculateFundedUntil(token, at(10n) - 1n).simulatedLockupCurrent).toBe(58n);
      expect(calculateFundedUntil(token, at(10n)).simulatedLockupCurrent).toBe(60n);
    });

    it("treats a timestamp at or before the last settled point as zero elapsed epochs", () => {
      const token = userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n });

      expect(calculateFundedUntil(token, SETTLED_TIMESTAMP).simulatedLockupCurrent).toBe(40n);
      expect(calculateFundedUntil(token, SETTLED_TIMESTAMP - 10_000n).simulatedLockupCurrent).toBe(40n);
    });
  });

  describe("at and beyond the funded-until boundary", () => {
    it("reports zero available with no debt at the exact moment funds run out", () => {
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n }), at(30n));

      expect(result).toEqual({
        availableFunds: 0n,
        debt: 0n,
        fundedUntilTimestamp: at(30n),
        simulatedLockupCurrent: 100n,
      });
    });

    it("clamps lockup at the funded-until epoch once it is passed", () => {
      // simulatedSettledAt stops at fundedUntilEpoch, so lockup never exceeds funds.
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n }), at(50n));

      expect(result.simulatedLockupCurrent).toBe(100n);
      expect(result.availableFunds).toBe(0n);
    });

    it("reports the shortfall as debt once obligations outrun funds", () => {
      // totalOwed = 40 + 2*50 = 140 against 100 funds.
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n }), at(50n));

      expect(result.debt).toBe(40n);
    });

    it("grows debt with elapsed time while available funds stay clamped at zero", () => {
      const token = userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 2n });

      // totalOwed = 40 + 2*elapsed, against 100 funds.
      expect(calculateFundedUntil(token, at(40n)).debt).toBe(20n);
      expect(calculateFundedUntil(token, at(60n)).debt).toBe(60n);
      expect(calculateFundedUntil(token, at(60n)).availableFunds).toBe(0n);
    });
  });

  describe("edge cases", () => {
    it("reports an already-exhausted account as expired at the settled point", () => {
      const result = calculateFundedUntil(userToken({ funds: 40n, lockupCurrent: 40n, lockupRate: 2n }), at(10n));

      expect(result).toEqual({
        availableFunds: 0n,
        debt: 20n,
        fundedUntilTimestamp: SETTLED_TIMESTAMP,
        simulatedLockupCurrent: 40n,
      });
    });

    it("truncates fractional runway when funds do not divide evenly by the rate", () => {
      // (100 - 40) / 7 = 8.57 → 8 epochs.
      const result = calculateFundedUntil(userToken({ funds: 100n, lockupCurrent: 40n, lockupRate: 7n }), at(1n));

      expect(result.fundedUntilTimestamp).toBe(at(8n));
    });

    it("handles values beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
      const funds = 10n ** 24n;
      const lockupCurrent = 10n ** 23n;
      const result = calculateFundedUntil(userToken({ funds, lockupCurrent, lockupRate: 10n ** 18n }), at(100n));

      expect(result.simulatedLockupCurrent).toBe(lockupCurrent + 100n * 10n ** 18n);
      expect(result.availableFunds).toBe(funds - result.simulatedLockupCurrent);
      expect(result.debt).toBe(0n);
    });

    it("accepts the string amounts the subgraph returns", () => {
      const result = calculateFundedUntil(
        {
          funds: "100",
          lockupCurrent: "40",
          lockupRate: "2",
          lockupLastSettledUntilEpoch: SETTLED_EPOCH,
          lockupLastSettledUntilTimestamp: SETTLED_TIMESTAMP,
        } as unknown as UserToken,
        at(10n),
      );

      expect(result.simulatedLockupCurrent).toBe(60n);
      expect(result.availableFunds).toBe(40n);
    });
  });
});
