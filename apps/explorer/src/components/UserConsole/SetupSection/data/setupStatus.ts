import { formatUnits, maxUint256, parseUnits } from "viem";
import {
  roundUpUnits,
  SUGGESTED_TOPUP_DISPLAY_DECIMALS,
  USDFC_DECIMALS,
} from "@/components/UserConsole/FundsSection/data/funding-runway";
import { DEFAULT_MAX_LOCKUP_PERIOD } from "@/utils/constants";
import { type ExpiryRead, isScopeActive, type ScopeId } from "@/utils/sessionKeys";

/** How often the setup page rereads what it shows, so work done in another tab or by the tool appears. */
export const SETUP_POLL_MS = 15_000;

/** A requested session key's grant as the registry reports it. */
export type KeyGrant =
  | { state: "loading" }
  | { state: "unreadable" }
  | { state: "none" }
  | { state: "partial" }
  /** Every requested scope is live; `expiresAt` is the earliest of their expiries, in unix seconds. */
  | { state: "authorized"; expiresAt: bigint };

/**
 * Reads one `authorizationExpiry` per requested scope, in `scopes` order. A
 * scope counts as granted while its expiry is in the future; one failed read
 * leaves the whole grant unreadable rather than guessing at it.
 */
export function keyGrant(
  scopes: readonly ScopeId[],
  reads: readonly ExpiryRead[] | undefined,
  nowSec: bigint,
): KeyGrant {
  if (!reads || reads.length !== scopes.length) return { state: "loading" };
  const expiries: bigint[] = [];
  for (const read of reads) {
    if (read.status !== "success" || typeof read.result !== "bigint") return { state: "unreadable" };
    expiries.push(read.result);
  }
  const granted = expiries.filter((expiry) => isScopeActive(expiry, nowSec)).length;
  if (granted === 0) return { state: "none" };
  if (granted < scopes.length) return { state: "partial" };
  return { state: "authorized", expiresAt: expiries.reduce((min, expiry) => (expiry < min ? expiry : min)) };
}

/** An account's Filecoin Pay approval of an operator, as `operatorApprovals` returns it. */
export interface OperatorApprovalTerms {
  isApproved: boolean;
  rateAllowance: bigint;
  lockupAllowance: bigint;
  maxLockupPeriod: bigint;
}

/** Where the Warm Storage approval stands for this request. "limited" exists only when the link asks for unlimited. */
export type ApprovalState = "loading" | "unreadable" | "not-approved" | "limited" | "approved";

/**
 * Which allowances fall short of what tools built on synapse-core need before
 * they upload, mirroring its `isFwssMaxApproved`: an exactly unlimited rate
 * (the contract never draws it down), a lockup still above half of unlimited
 * (one-time payments such as CDN egress draw it down from max), and a lockup
 * period that covers the service's.
 */
export function limitShortfalls(terms: OperatorApprovalTerms): { rate: boolean; lockup: boolean; period: boolean } {
  return {
    rate: terms.rateAllowance !== maxUint256,
    lockup: terms.lockupAllowance < maxUint256 / 2n,
    period: terms.maxLockupPeriod < DEFAULT_MAX_LOCKUP_PERIOD,
  };
}

/** Approved with nothing short; see {@link limitShortfalls}. */
export function isMaxApproval(terms: OperatorApprovalTerms): boolean {
  const short = limitShortfalls(terms);
  return terms.isApproved && !short.rate && !short.lockup && !short.period;
}

export function approvalState(terms: OperatorApprovalTerms, unlimitedRequired: boolean): ApprovalState {
  if (!terms.isApproved) return "not-approved";
  return !unlimitedRequired || isMaxApproval(terms) ? "approved" : "limited";
}

/**
 * `setOperatorApproval` arguments after the token and operator that lift
 * every limit. A longer lockup period the owner already allows is kept.
 */
export function unlimitedApprovalTerms(current: OperatorApprovalTerms): [true, bigint, bigint, bigint] {
  const period =
    current.maxLockupPeriod > DEFAULT_MAX_LOCKUP_PERIOD ? current.maxLockupPeriod : DEFAULT_MAX_LOCKUP_PERIOD;
  return [true, maxUint256, maxUint256, period];
}

/** What Filecoin Pay still lacks for the request: nothing, a USDFC amount (base units), or some balance at all. */
export type Shortfall = { kind: "none" } | { kind: "amount"; amount: bigint } | { kind: "any" };

/**
 * What still has to go into Filecoin Pay for the request:
 * - With a `balance`, the gap to that target; the CLI computes it as what is
 *   available plus what it needs, so this is the same comparison it makes.
 *   Rounded up to the cent: lockup keeps drawing the balance down, and a
 *   deposit that lands a fraction short would leave the step open.
 * - With only a `deposit`, the amount on top that this tab has not yet seen
 *   go in: `netDeposited` (see {@link netDeposited}) against `baseline`, its
 *   value when the page first opened. Until the baseline is known, the whole amount.
 * - With neither, some balance until there is any.
 */
export function shortfall({
  available,
  netDeposited: net,
  baseline,
  deposit,
  balance,
}: {
  available: bigint;
  netDeposited: bigint;
  baseline: bigint | null;
  deposit: string | null;
  balance: string | null;
}): Shortfall {
  if (balance !== null) {
    const missing = parseUnits(balance, USDFC_DECIMALS) - available;
    return missing > 0n
      ? { kind: "amount", amount: roundUpUnits(missing, USDFC_DECIMALS, SUGGESTED_TOPUP_DISPLAY_DECIMALS) }
      : { kind: "none" };
  }
  if (deposit !== null) {
    const amount = parseUnits(deposit, USDFC_DECIMALS);
    const added = baseline === null ? 0n : net - baseline;
    return added >= amount ? { kind: "none" } : { kind: "amount", amount: amount - (added > 0n ? added : 0n) };
  }
  return available > 0n ? { kind: "none" } : { kind: "any" };
}

/**
 * How long a stored deposit baseline counts. A reload while the owner works
 * through the page keeps it; a request opened in the same tab much later
 * measures from its own opening value instead of an old deposit.
 */
export const DEPOSIT_BASELINE_TTL_MS = 60 * 60 * 1_000;

/** The session storage value for a baseline taken at `nowMs`. */
export function writeDepositBaseline(baseline: bigint, nowMs: number): string {
  return JSON.stringify({ baseline: baseline.toString(), savedAt: nowMs });
}

/** A stored baseline still in date, or null when absent, malformed or expired. */
export function readDepositBaseline(stored: string | null, nowMs: number): bigint | null {
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { baseline, savedAt } = parsed as { baseline?: unknown; savedAt?: unknown };
    if (typeof baseline !== "string" || !/^-?\d+$/.test(baseline)) return null;
    if (typeof savedAt !== "number" || savedAt > nowMs || nowMs - savedAt > DEPOSIT_BASELINE_TTL_MS) return null;
    return BigInt(baseline);
  } catch {
    return null;
  }
}

/** Subgraph amounts arrive as decimal strings, though the generated types say bigint. */
type Amount = bigint | string;

/**
 * Deposits minus withdrawals into Filecoin Pay, from an account's USDFC
 * record: settlements move `funds` and `payout` by the same amount, and lockup
 * moves neither, so this changes only when money goes in or out. (Commission
 * paid to a fee recipient lands in `funds` alone; a setup account is not one.)
 */
export function netDeposited(token: { funds: Amount; payout: Amount; fundsCollected: Amount } | null): bigint {
  if (!token) return 0n;
  return BigInt(token.funds) + BigInt(token.payout) - BigInt(token.fundsCollected);
}

/** Whether the wallet's own USDFC can make up the shortfall, so a deposit is all it takes. */
export function walletCovers(missing: Shortfall, walletUsdfc: bigint): boolean {
  if (missing.kind === "none") return true;
  if (missing.kind === "any") return walletUsdfc > 0n;
  return walletUsdfc >= missing.amount;
}

/** The amount a deposit form opens with: the shortfall as typed, or empty for the owner to choose. */
export function depositPrefill(missing: Shortfall): string {
  return missing.kind === "amount" ? formatUnits(missing.amount, USDFC_DECIMALS) : "";
}

/** The shortfall as the steps name it: "2.5 USDFC", or just "USDFC" when any amount will do. */
export function shortfallLabel(missing: Shortfall): string {
  return missing.kind === "amount" ? `${depositPrefill(missing)} USDFC` : "USDFC";
}

export type Read<T> = { state: "loading" } | { state: "unreadable" } | ({ state: "ready" } & T);

/**
 * What the Fund Filecoin Pay step offers. The steps keep a fixed order
 * (key, approval, funds) and only this changes as the reads come in:
 * - "checking": a read it depends on is still loading.
 * - "done": Filecoin Pay holds what the request asks for.
 * - "with-approval": the approval above deposits it in the same transaction,
 *   because Warm Storage still needs approving and the wallet holds enough.
 * - "deposit": the wallet holds enough; the Deposit dialog moves it in.
 * - "add-funds": it does not, so the usual Add funds flow, which deposits
 *   into Filecoin Pay. An unreadable wallet counts as not holding enough.
 */
export type FundsOffer = "checking" | "done" | "with-approval" | "deposit" | "add-funds";

export function fundsOffer({
  missing,
  walletUsdfc,
  approval,
}: {
  /** null while the Filecoin Pay balance is still loading. */
  missing: Shortfall | null;
  walletUsdfc: Read<{ balance: bigint }>;
  approval: ApprovalState;
}): FundsOffer {
  if (missing === null) return "checking";
  if (missing.kind === "none") return "done";
  if (walletUsdfc.state === "loading") return "checking";
  if (walletUsdfc.state !== "ready" || !walletCovers(missing, walletUsdfc.balance)) return "add-funds";
  if (approval === "loading") return "checking";
  // The approve step offers Add a Service exactly while Warm Storage is not approved.
  return approval === "not-approved" || approval === "unreadable" ? "with-approval" : "deposit";
}

/** The request is set up once every step it asked for is done; the funds step only counts when it named an amount. */
export function isSetupComplete({
  keyRequested,
  grant,
  approved,
  fundsCovered,
}: {
  keyRequested: boolean;
  grant: KeyGrant;
  approved: boolean;
  fundsCovered: boolean;
}): boolean {
  return (!keyRequested || grant.state === "authorized") && approved && fundsCovered;
}
