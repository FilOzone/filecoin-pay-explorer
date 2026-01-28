# Metric Definitions

This document defines the metrics displayed in the Filecoin Pay Console dashboard.

## Hero Metrics

The dashboard displays different metrics depending on build mode.

### GA Mode Metrics

#### Active Payers
- **Definition:** Count of payer wallets with at least one active rail AND positive lockup
- **Source:** `Account` entities from Goldsky subgraph
- **Formula:** Count where `account.payerRails.some(rail.state == "Active") AND account.userTokens.some(lockupCurrent > 0)`
- **Criteria:**
  - At least 1 rail with `state = "Active"`
  - `lockupCurrent > 0` (funds locked for future payments)

#### Locked USDFC
- **Definition:** Total USDFC currently locked across all accounts for future payments
- **Source:** Sum of `Account.userTokens.lockupCurrent` from Goldsky subgraph
- **Formula:** `Σ(account.userTokens.lockupCurrent)` converted from wei (18 decimals) to USDFC
- **Note:** This represents the total amount of USDFC that has been deposited and is locked to secure active payment rails. Displayed between Active Payers and USDFC Settled.

#### USDFC Settled (Cumulative)
- **Definition:** Cumulative sum of all USDFC settled across all payment rails since inception
- **Source:** Sum of `Rail.totalSettledAmount` across all rails with settlements
- **Formula:** `Σ(rail.totalSettledAmount)` converted from wei (18 decimals) to USDFC

#### Churned Wallets
- **Definition:** Count of payer wallets where ALL rails have been terminated
- **Source:** `Account` entities from Goldsky subgraph
- **Formula:** Count where `account.payerRails.length > 0 AND account.payerRails.every(rail.state == "Terminated")`
- **Criteria:**
  - Has created at least 1 rail (was previously active)
  - ALL rails have `state = "Terminated"` (no active or finalized rails)

#### FIL Burned
- **Definition:** Total FIL burned from three sources:
  1. Settling USDFC
  2. Settling FIL
  3. Auction
- **Status:** Coming soon (placeholder metric)
- **Source:** Engineering will drive implementation
- **Note:** Non-functional in current release - displays placeholder value

### Prototype Mode Metrics

#### Unique Payers
- **Definition:** Count of distinct wallet addresses that have created at least one payment rail as the payer
- **Source:** `PaymentsMetric.uniquePayers` from Goldsky subgraph
- **Formula:** Incremented when an account creates their first rail as payer

#### Locked USDFC
- **Definition:** Total USDFC currently locked across all accounts for future payments
- **Source:** Sum of `Account.userTokens.lockupCurrent` from Goldsky subgraph
- **Formula:** `Σ(account.userTokens.lockupCurrent)` converted from wei (18 decimals) to USDFC
- **Note:** Same metric as GA Mode. Displayed between Active Payers and USDFC Settled.

#### Total Settled (USDFC)
- **Definition:** Cumulative sum of all USDFC settled across all payment rails since inception
- **Source:** Sum of `Rail.totalSettledAmount` across all rails with settlements
- **Formula:** `Σ(rail.totalSettledAmount)` converted from wei (18 decimals) to USDFC

#### Settled (7d)
- **Definition:** Total USDFC settled in the last 7 days (rolling window)
- **Source:** `Settlement` events from Goldsky subgraph filtered by timestamp
- **Formula:** `Σ(settlement.totalSettledAmount)` where `settlement.settledUpto >= (now - 7 days)`
- **Note:** This is actual settlement activity, not projected

#### FIL Burned
- **Definition:** Total FIL burned from three sources:
  1. Settling USDFC
  2. Settling FIL
  3. Auction
- **Status:** Coming soon (placeholder metric)
- **Source:** Engineering will drive implementation
- **Note:** Same metric as GA Mode. Non-functional in current release - displays placeholder value.

---

## Payer Accounts Table Columns

### Address
- **Definition:** The wallet address of the payer account
- **Display:** Truncated address (`0x1234...abcd`) or ENS name if resolved

### Rails
- **Definition:** Count of payment rails created by this payer
- **Source:** `account.payerRails.length`
- **Sortable:** Yes

### Data Size
- **Definition:** Total data size in GB across all payees' PDP proof sets
- **Source:** PDP Explorer Subgraph (`Provider.totalDataSize`)
- **Correlation:** Matches payer → payee addresses → PDP Provider addresses
- **Formula:** `Σ(payee.pdp.totalDataSize)` converted from bytes to GB
- **Display:** Formatted as MB, GB, or TB (e.g., "1.23 TB", "456.78 GB")
- **Note:** Shows "-" if no PDP data available for any payee
- **Sortable:** Yes

### Proven
- **Definition:** Proof submission status for the payer's payees
- **Source:** PDP Explorer Subgraph (`Provider.lastProvenEpoch`)
- **Values:**
  - **Yes** (green): All payees have submitted proofs within the last 24 hours (2880 epochs)
  - **Stale** (yellow): At least one payee has proofs older than 24 hours
  - **-** (gray): No PDP data available for any payee
- **Calculation:**
  ```
  currentEpoch = (now - FILECOIN_GENESIS) / 30 seconds
  isProven = lastProvenEpoch > 0 AND (currentEpoch - lastProvenEpoch) <= 2880
  ```
- **Note:** Filecoin genesis timestamp is 2020-08-25 00:00:00 UTC (1598306400)

### Total Settled
- **Definition:** Cumulative USDFC settled by this payer across all their rails
- **Source:** `Σ(rail.totalSettledAmount)` from payer's rails
- **Display:** Formatted as currency (e.g., "$1.23K", "$456.78")
- **Sortable:** Yes

### Settled (7d)
- **Definition:** USDFC settled by this payer in the last 7 days
- **Source:** `Settlement` events filtered by payer address and timestamp
- **Formula:** `Σ(settlement.totalSettledAmount)` where `settlement.rail.payer.address == payerAddress AND timestamp >= now - 7 days`
- **Display:** Formatted as currency
- **Sortable:** Yes

### Locked
- **Definition:** Total USDFC currently locked in the payer's account for future payments
- **Source:** `Σ(userToken.lockupCurrent)` across payer's token balances
- **Display:** Formatted as currency
- **Sortable:** Yes

### Runway
- **Definition:** Estimated days until locked funds are depleted at current lockup rate
- **Source:** Calculated from `userToken.funds` and `userToken.lockupRate`
- **Formula:**
  ```
  dailyBurn = lockupRate × EPOCHS_PER_DAY (2880)
  runwayDays = funds / dailyBurn
  ```
- **Display:** "X days", "Xy Xd" for years, or "-" if no rate
- **Sortable:** Yes

### First Active
- **Definition:** Date when the payer created their first payment rail
- **Source:** `min(rail.createdAt)` from payer's rails
- **Display:** Formatted as "MMM DD 'YY" (e.g., "Jan 12 '26")
- **Sortable:** Yes

---

## Data Sources

### Filecoin Pay Subgraph (Goldsky)
- **Endpoint:** `https://api.goldsky.com/api/public/project_cmj7soo5uf4no01xw0tij21a1/subgraphs/filecoin-pay-mainnet/1.1.0/gn`
- **Entities Used:** Account, Rail, Settlement, PaymentsMetric, UserToken, Token
- **Purpose:** Payment rails, settlements, account balances

### PDP Explorer Subgraph (Goldsky)
- **Endpoint:** `https://api.goldsky.com/api/public/project_cmdfaaxeuz6us01u359yjdctw/subgraphs/pdp-explorer/mainnet311/gn`
- **Entities Used:** Provider
- **Purpose:** Storage provider proof status and data sizes
- **Correlation Key:** `Provider.address` matches `Rail.payee.address`

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `EPOCH_DURATION_SECONDS` | 30 | Duration of one Filecoin epoch |
| `EPOCHS_PER_DAY` | 2880 | 24 × 60 × 60 / 30 |
| `EPOCHS_PER_24_HOURS` | 2880 | Used for proof freshness check |
| `FILECOIN_GENESIS_TIMESTAMP` | 1598306400 | 2020-08-25 00:00:00 UTC |
| `TOKEN_DECIMALS` | 18 | USDFC decimal places |
| `BYTES_PER_GB` | 1073741824 | 1024³ |

---

## Removed Metrics

### Monthly Run Rate (MRR)
- **Status:** Removed as of v0.11.0
- **Reason:** Replaced with actual settlement data (Settled 7d) for more accurate activity representation
- **Previous Definition:** Projected monthly payment volume based on active rail payment rates
- **Previous Formula:** `Σ(activeRail.paymentRate) × EPOCHS_PER_MONTH (86,400)`
