# Metric Definitions

This document defines the hero metrics displayed in the Filecoin Pay Console dashboard.

## Status

* 2026-02-09 - Initial GA metric set definitions.

---

## 1. Total Locked (USDFC & FIL)

- **Definition:** Total amount of USDFC and FIL currently locked across all payment rails
- **Display:** FIL and USDFC displayed separately (no conversion)
- **Purpose:** Represents funds deposited and locked in active payment rails
- **Source:** `Token` entities from Goldsky subgraph
- **Formula:**
  ```
  For each token (USDFC, FIL):
    totalLocked = token.lockupCurrent + token.lockupRate * (blockNumber - token.lockupLastSettledUntilEpoch) where token == tokenAddress
  ```
- **Conversion:** Divide by 10^18 (TOKEN_DECIMALS) for human-readable values

---

## 2. Total Transacted (USDFC & FIL) — Cumulative

- **Definition:** Cumulative sum of all USDFC and FIL transacted across all payment rails since inception
- **Includes:** Settlement payments + one-time payments
- **Display:** FIL and USDFC displayed separately (no conversion)
- **Source:** `Token.totalSettledAmount` and `Token.totalOneTimePayment` from Goldsky subgraph
- **Formula:**
  ```
  For each token (USDFC, FIL):
    totalTransacted = (token.totalSettledAmount + token.totalOneTimePayment) where token == tokenAddress
  ```
- **Conversion:** Divide by 10^18 (TOKEN_DECIMALS) for human-readable values

---

## 3. Total FIL Burned — Cumulative

- **Definition:** Cumulative sum of FIL burned across all payment rails since inception
- **Sources:**
  1. **Direct burn from FIL transfers:** When a payment rail settles in FIL or when a one-time payment occures, a portion of transffered FIL is burned
  2. **Auction burn (`burnForFIL`):** FIL burned via Filecoin Pay Auction mechanism
- **Source Entity:** `PaymentsMetric` from Goldsky subgraph
- **Formula:**
  ```
  totalFilBurned = paymentsMetric.totalFilBurned
  ```
- **Conversion:** Divide by 10^18 for human-readable FIL values
