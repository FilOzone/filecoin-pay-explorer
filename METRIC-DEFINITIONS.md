# Metric Definitions

This document defines the hero metrics displayed in the Filecoin Pay Console dashboard.

---

## 1. Total Locked (USDFC & FIL)

- **Definition:** Total amount of USDFC and FIL currently locked across all payment rails
- **Display:** FIL and USDFC displayed separately (no conversion)
- **Purpose:** Represents funds deposited and locked in active payment rails
- **Source:** `UserToken` entities from Goldsky subgraph, grouped by `Token`
- **Formula:**
  ```
  For each token (USDFC, FIL):
    totalLocked = Σ(userToken.lockupCurrent) where userToken.token == tokenAddress
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
  1. **Direct burn from FIL settlement:** When a payment rail settles in FIL, a portion is burned
  2. **Auction burn (`burnForFIL`):** FIL burned via Filecoin Pay Auction mechanism
- **Source Entity:** `PaymentsMetric` from Goldsky subgraph
- **Formula:**
  ```
  totalFilBurned = paymentsMetric.totalFilBurned
  ```
- **Conversion:** Divide by 10^18 for human-readable FIL values

---

## Data Sources

### Filecoin Pay Subgraph (Goldsky)
- **Endpoint:** `https://api.goldsky.com/api/public/project_cmj7soo5uf4no01xw0tij21a1/subgraphs/filecoin-pay-mainnet/1.1.0/gn`
- **Entities Used:** Token, UserToken, PaymentsMetric, Settlement, OneTimePayment
- **Purpose:** Payment rails, settlements, account balances, burn tracking

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TOKEN_DECIMALS` | 18 | Decimal places for USDFC and FIL |
