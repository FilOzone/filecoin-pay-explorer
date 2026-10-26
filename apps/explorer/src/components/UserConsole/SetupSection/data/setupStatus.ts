import { formatUnits, type Hex, maxUint256, parseUnits } from "viem";
import {
  roundUpUnits,
  SUGGESTED_TOPUP_DISPLAY_DECIMALS,
  USDFC_DECIMALS,
} from "@/components/UserConsole/FundsSection/data/funding-runway";
import { DEFAULT_MAX_LOCKUP_PERIOD } from "@/utils/constants";
import type { GroupKeyChoice } from "@/utils/groupKeyGrant";
import { type ExpiryRead, isScopeActive, type ScopeId } from "@/utils/sessionKeys";
import { isUserRejectedRequest, walletErrorMessage } from "@/utils/walletErrors";

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
 *   Debt counts too: a deposit settles it before any of it becomes available.
 *   Rounded up to the cent: lockup keeps drawing the balance down, and a
 *   deposit that lands a fraction short would leave the step open.
 * - With only a `deposit`, the amount on top that this tab has not yet seen
 *   go in: the account's `funds` against `baseline`, their value when the page
 *   first opened. Deposits raise `funds` and lockup does not move it, so a
 *   deposit counts the moment its receipt lands. A rail settled during the
 *   visit lowers it, so the step may ask for that much more; it never counts
 *   a deposit that did not happen. Until the baseline is known, the whole amount.
 * - With neither, some balance until there is any.
 */
export function shortfall({
  available,
  debt,
  funds,
  baseline,
  deposit,
  balance,
}: {
  available: bigint;
  /** What the account owes beyond its funds; `available` is 0 while there is any. */
  debt: bigint;
  /** The account's `funds`, deposits and all, before lockup. */
  funds: bigint;
  baseline: bigint | null;
  deposit: string | null;
  balance: string | null;
}): Shortfall {
  if (balance !== null) {
    const missing = parseUnits(balance, USDFC_DECIMALS) + debt - available;
    return missing > 0n
      ? { kind: "amount", amount: roundUpUnits(missing, USDFC_DECIMALS, SUGGESTED_TOPUP_DISPLAY_DECIMALS) }
      : { kind: "none" };
  }
  if (deposit !== null) {
    const amount = parseUnits(deposit, USDFC_DECIMALS);
    const added = baseline === null ? 0n : funds - baseline;
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

/** A Filecoin Pay account as `accounts(token, owner)` returns it. */
export interface PayAccount {
  funds: bigint;
  lockupCurrent: bigint;
  lockupRate: bigint;
  /** The epoch `lockupCurrent` was last settled to. */
  lockupLastSettledAt: bigint;
}

/**
 * What the account can spend at `epoch`, and what it owes beyond its funds,
 * rolling its lockup forward from the last settlement the way the contract
 * does: the same figures `calculateFundedUntil` derives from the subgraph,
 * from the chain's own answer.
 */
export function accountBalanceAt(account: PayAccount, epoch: bigint): { available: bigint; debt: bigint } {
  const { funds, lockupCurrent, lockupRate, lockupLastSettledAt } = account;
  const elapsed = epoch > lockupLastSettledAt ? epoch - lockupLastSettledAt : 0n;
  const owed = lockupCurrent + lockupRate * elapsed;
  return { available: funds > owed ? funds - owed : 0n, debt: owed > funds ? owed - funds : 0n };
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
 *   An approval that could not be read waits here like one still loading:
 *   the approve step offers a Retry, not Add a Service, until it answers.
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
  if (approval === "loading" || approval === "unreadable") return "checking";
  // The approve step offers Add a Service exactly while Warm Storage is not approved.
  return approval === "not-approved" ? "with-approval" : "deposit";
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

/** Where the group key step stands: one value per render, so it shows one status and one notice. */
export type GroupKeyPhase =
  | { phase: "issued"; grant: string }
  /** `pubkeysig` does not recover to the session key: nothing may be signed for this link. */
  | { phase: "unsigned-pubkey" }
  /** The session key is not authorized yet, and the Grant's claim ends with that authorization. */
  | { phase: "waiting-for-key" }
  | { phase: "read-failed" }
  /** The default group key id is on chain, but its data sets are not a valid group. */
  | { phase: "inconsistent-default"; groupKeyId: Hex; dataSetIds: bigint[] }
  | { phase: "choosing" }
  | { phase: "connecting-wallet" }
  | { phase: "signing" }
  | { phase: "sign-failed"; message: string }
  | { phase: "ready" };

export interface GroupKeyReads {
  /** Whether `pubkeysig` recovers to the session key; undefined while it is checked. */
  signatureValid: boolean | undefined;
  /** The session key's authorization expiry, unix seconds; null until it is authorized. */
  expires: bigint | null;
  /** The group key choice; undefined until the data set scan settles. */
  choice: GroupKeyChoice | undefined;
  choiceFailed: boolean;
  walletReady: boolean;
  /** The signing mutation: pending, its error (null when none), and the Grant it made. */
  issuing: boolean;
  issueError: unknown;
  grant: string | undefined;
}

/** What a failed signing shows: a declined prompt gets its own copy, anything else viem's short message. */
export function signingFailure(error: unknown): string {
  if (isUserRejectedRequest(error)) return "You declined the signature. No Grant was made.";
  return walletErrorMessage(error, "Something went wrong. Try again.");
}

/**
 * The group key step's phase from its raw reads. Precedence, first match wins:
 * issued > unsigned-pubkey > choosing (signature check pending) > read-failed >
 * inconsistent-default > waiting-for-key > choosing > signing > connecting-wallet >
 * sign-failed > ready.
 * A made Grant outlives every later read; a bad signature blocks everything else.
 * The signature check is a local recovery, so while it runs the step reads as
 * choosing, as the scan waits on it. A failed scan or a broken default group key
 * is shown before authorization, so the owner learns of it before paying for that
 * transaction. A signature in flight outlasts a wallet client that drops out
 * mid-request, and Retry is never offered without a wallet.
 */
export function groupKeyPhase(reads: GroupKeyReads): GroupKeyPhase {
  if (reads.grant !== undefined) return { phase: "issued", grant: reads.grant };
  if (reads.signatureValid === false) return { phase: "unsigned-pubkey" };
  if (reads.signatureValid === undefined) return { phase: "choosing" };
  if (reads.choiceFailed) return { phase: "read-failed" };
  if (reads.choice && "error" in reads.choice) {
    return { phase: "inconsistent-default", groupKeyId: reads.choice.groupKeyId, dataSetIds: reads.choice.dataSetIds };
  }
  if (reads.expires === null) return { phase: "waiting-for-key" };
  if (!reads.choice) return { phase: "choosing" };
  if (reads.issuing) return { phase: "signing" };
  if (!reads.walletReady) return { phase: "connecting-wallet" };
  if (reads.issueError != null) return { phase: "sign-failed", message: signingFailure(reads.issueError) };
  return { phase: "ready" };
}
