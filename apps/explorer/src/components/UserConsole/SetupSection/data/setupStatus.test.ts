import assert from "node:assert/strict";
import { BaseError, maxUint256, UserRejectedRequestError } from "viem";
import { describe, it } from "vitest";
import {
  accountBalanceAt,
  approvalState,
  DEPOSIT_BASELINE_TTL_MS,
  depositPrefill,
  fundsOffer,
  type GroupKeyReads,
  groupKeyPhase,
  isMaxApproval,
  isSetupComplete,
  keyGrant,
  limitShortfalls,
  readDepositBaseline,
  shortfall,
  shortfallLabel,
  signingFailure,
  unlimitedApprovalTerms,
  walletCovers,
  writeDepositBaseline,
} from "./setupStatus";

const NOW = 1_000n;
const ok = (result: bigint) => ({ status: "success" as const, result });

describe("keyGrant", () => {
  it("waits while the reads are missing or still a different length", () => {
    assert.deepEqual(keyGrant(["addPieces"], undefined, NOW), { state: "loading" });
    assert.deepEqual(keyGrant(["addPieces", "createDataSet"], [ok(2_000n)], NOW), { state: "loading" });
  });

  it("reports a failed read as unreadable rather than as not granted", () => {
    assert.deepEqual(
      keyGrant(["addPieces", "createDataSet"], [ok(2_000n), { status: "failure", result: undefined }], NOW),
      { state: "unreadable" },
    );
  });

  it("counts a scope as granted until its expiry has passed, as the registry does", () => {
    assert.deepEqual(keyGrant(["addPieces"], [ok(0n)], NOW), { state: "none" });
    assert.deepEqual(keyGrant(["addPieces"], [ok(NOW - 1n)], NOW), { state: "none" });
    assert.deepEqual(keyGrant(["addPieces"], [ok(NOW)], NOW), { state: "authorized", expiresAt: NOW });
    assert.deepEqual(keyGrant(["createDataSet", "addPieces"], [ok(2_000n), ok(500n)], NOW), { state: "partial" });
  });

  it("reports the earliest expiry once every requested scope is live", () => {
    assert.deepEqual(keyGrant(["createDataSet", "addPieces"], [ok(3_000n), ok(2_000n)], NOW), {
      state: "authorized",
      expiresAt: 2_000n,
    });
  });
});

describe("shortfall", () => {
  const ONE = 10n ** 18n;
  const missing = (overrides: Partial<Parameters<typeof shortfall>[0]>) =>
    shortfall({
      available: 0n,
      debt: 0n,
      funds: 0n,
      baseline: null,
      deposit: null,
      balance: null,
      ...overrides,
    });

  it("asks for some balance until there is any, when the link names no amount", () => {
    assert.deepEqual(missing({}), { kind: "any" });
    assert.deepEqual(missing({ available: 1n }), { kind: "none" });
  });

  it("with a balance, is the gap to it, rounded up to the cent, whatever the deposit says", () => {
    // 7.342 available, 17.342 needed: 10 to add.
    assert.deepEqual(missing({ available: 7_342n * 10n ** 15n, deposit: "10", balance: "17.342" }), {
      kind: "amount",
      amount: 10n * ONE,
    });
    // Lockup drew 0.0005 since: still offered as a whole cent more, not dust.
    assert.deepEqual(missing({ available: 7_3415n * 10n ** 14n, balance: "17.342" }), {
      kind: "amount",
      amount: 1001n * 10n ** 16n,
    });
    assert.deepEqual(missing({ available: 17_342n * 10n ** 15n, balance: "17.342" }), { kind: "none" });
  });

  it("with a balance, adds what the account owes, which a deposit settles first", () => {
    // 10 owed and nothing available: 2 more would only pay part of the debt.
    assert.deepEqual(missing({ debt: 10n * ONE, balance: "2" }), { kind: "amount", amount: 12n * ONE });
  });

  it("with only a deposit, is the whole amount on top until this tab sees it go in", () => {
    const ten = { deposit: "10", available: 7n * ONE };
    assert.deepEqual(missing({ ...ten, funds: 7n * ONE, baseline: null }), {
      kind: "amount",
      amount: 10n * ONE,
    });
    assert.deepEqual(missing({ ...ten, funds: 7n * ONE, baseline: 7n * ONE }), {
      kind: "amount",
      amount: 10n * ONE,
    });
    // 4 went in: 6 left.
    assert.deepEqual(missing({ ...ten, funds: 11n * ONE, baseline: 7n * ONE }), {
      kind: "amount",
      amount: 6n * ONE,
    });
    assert.deepEqual(missing({ ...ten, funds: 17n * ONE, baseline: 7n * ONE }), { kind: "none" });
  });

  it("with only a deposit, ignores what Filecoin Pay already held", () => {
    // Already holding more than the deposit is not the deposit going in.
    assert.deepEqual(missing({ deposit: "10", available: 12n * ONE, funds: 12n * ONE, baseline: 12n * ONE }), {
      kind: "amount",
      amount: 10n * ONE,
    });
  });

  it("does not count a withdrawal since the page opened as less than nothing deposited", () => {
    assert.deepEqual(missing({ deposit: "10", funds: 5n * ONE, baseline: 7n * ONE }), {
      kind: "amount",
      amount: 10n * ONE,
    });
  });
});

describe("accountBalanceAt", () => {
  const account = { funds: 100n, lockupCurrent: 20n, lockupRate: 2n, lockupLastSettledAt: 1_000n };

  it("rolls the lockup forward from the last settlement to the epoch read", () => {
    assert.deepEqual(accountBalanceAt(account, 1_000n), { available: 80n, debt: 0n });
    // 10 epochs at 2 a epoch: 20 more locked.
    assert.deepEqual(accountBalanceAt(account, 1_010n), { available: 60n, debt: 0n });
  });

  it("reports what is owed beyond the funds as debt, with nothing available", () => {
    // 50 epochs: 120 owed against 100.
    assert.deepEqual(accountBalanceAt(account, 1_050n), { available: 0n, debt: 20n });
  });

  it("does not roll backwards from an epoch before the last settlement", () => {
    assert.deepEqual(accountBalanceAt(account, 900n), { available: 80n, debt: 0n });
  });
});

describe("walletCovers and depositPrefill", () => {
  const ONE = 10n ** 18n;

  it("covers an amount the wallet holds, and some balance with any USDFC at all", () => {
    assert.equal(walletCovers({ kind: "amount", amount: 266n * 10n ** 16n }, 5n * ONE), true);
    assert.equal(walletCovers({ kind: "amount", amount: 266n * 10n ** 16n }, 2n * ONE), false);
    assert.equal(walletCovers({ kind: "any" }, 1n), true);
    assert.equal(walletCovers({ kind: "any" }, 0n), false);
    assert.equal(walletCovers({ kind: "none" }, 0n), true);
  });

  it("opens the deposit form on the shortfall, or empty for the owner to choose", () => {
    assert.equal(depositPrefill({ kind: "amount", amount: 266n * 10n ** 16n }), "2.66");
    assert.equal(depositPrefill({ kind: "any" }), "");
  });
});

describe("isSetupComplete", () => {
  const authorized = { state: "authorized" as const, expiresAt: 2_000n };

  it("needs the key only when the link asked for one", () => {
    assert.equal(
      isSetupComplete({ keyRequested: false, grant: { state: "none" }, approved: true, fundsCovered: true }),
      true,
    );
    assert.equal(
      isSetupComplete({ keyRequested: true, grant: { state: "none" }, approved: true, fundsCovered: true }),
      false,
    );
    assert.equal(
      isSetupComplete({
        keyRequested: true,
        grant: { state: "partial" },
        approved: true,
        fundsCovered: true,
      }),
      false,
    );
    assert.equal(isSetupComplete({ keyRequested: true, grant: authorized, approved: true, fundsCovered: true }), true);
  });

  it("always needs Warm Storage approved, and the funds the link named", () => {
    assert.equal(
      isSetupComplete({ keyRequested: true, grant: authorized, approved: false, fundsCovered: true }),
      false,
    );
    assert.equal(
      isSetupComplete({ keyRequested: true, grant: authorized, approved: true, fundsCovered: false }),
      false,
    );
  });
});

describe("isMaxApproval", () => {
  const MAX = { isApproved: true, rateAllowance: maxUint256, lockupAllowance: maxUint256, maxLockupPeriod: 86_400n };

  it("passes the unlimited approval Add a Service grants by default", () => {
    assert.equal(isMaxApproval(MAX), true);
  });

  it("needs the rate exactly unlimited", () => {
    assert.equal(isMaxApproval({ ...MAX, rateAllowance: maxUint256 - 1n }), false);
  });

  it("accepts a lockup worn down from unlimited, down to half of it", () => {
    assert.equal(isMaxApproval({ ...MAX, lockupAllowance: maxUint256 - 10n ** 18n }), true);
    assert.equal(isMaxApproval({ ...MAX, lockupAllowance: maxUint256 / 2n }), true);
    assert.equal(isMaxApproval({ ...MAX, lockupAllowance: maxUint256 / 2n - 1n }), false);
  });

  it("needs a lockup period of at least 30 days", () => {
    assert.equal(isMaxApproval({ ...MAX, maxLockupPeriod: 86_399n }), false);
    assert.equal(isMaxApproval({ ...MAX, maxLockupPeriod: maxUint256 }), true);
  });

  it("fails an approval that was withdrawn, whatever its allowances", () => {
    assert.equal(isMaxApproval({ ...MAX, isApproved: false }), false);
  });
});

describe("limitShortfalls", () => {
  it("names each allowance that falls short, and only those", () => {
    assert.deepEqual(
      limitShortfalls({ isApproved: true, rateAllowance: maxUint256, lockupAllowance: 1n, maxLockupPeriod: 86_400n }),
      { rate: false, lockup: true, period: false },
    );
  });
});

describe("approvalState", () => {
  const LIMITED = {
    isApproved: true,
    rateAllowance: 10n ** 18n,
    lockupAllowance: 10n ** 18n,
    maxLockupPeriod: 86_400n,
  };

  it("keeps the owner's limits as approved unless the link asks for unlimited", () => {
    assert.equal(approvalState(LIMITED, false), "approved");
    assert.equal(approvalState(LIMITED, true), "limited");
  });

  it("reports a missing approval the same either way", () => {
    assert.equal(approvalState({ ...LIMITED, isApproved: false }, false), "not-approved");
    assert.equal(approvalState({ ...LIMITED, isApproved: false }, true), "not-approved");
  });
});

describe("unlimitedApprovalTerms", () => {
  const terms = (maxLockupPeriod: bigint) =>
    unlimitedApprovalTerms({ isApproved: true, rateAllowance: 1n, lockupAllowance: 1n, maxLockupPeriod });

  it("lifts both allowances and raises a short lockup period to 30 days", () => {
    assert.deepEqual(terms(2_880n), [true, maxUint256, maxUint256, 86_400n]);
  });

  it("keeps a longer lockup period the owner already allows", () => {
    assert.deepEqual(terms(172_800n), [true, maxUint256, maxUint256, 172_800n]);
  });
});

describe("fundsOffer", () => {
  const ONE = 10n ** 18n;
  const wallet = (balance: bigint) => ({ state: "ready" as const, balance });
  const ten = { kind: "amount" as const, amount: 10n * ONE };
  const offer = (overrides: Partial<Parameters<typeof fundsOffer>[0]>) =>
    fundsOffer({ missing: ten, walletUsdfc: wallet(0n), approval: "not-approved", ...overrides });

  it("deposits with the approval while Warm Storage needs approving and the wallet holds the amount", () => {
    assert.equal(offer({ walletUsdfc: wallet(10n * ONE) }), "with-approval");
  });

  it("deposits on its own once Warm Storage is approved, limits or not", () => {
    assert.equal(offer({ walletUsdfc: wallet(10n * ONE), approval: "approved" }), "deposit");
    assert.equal(offer({ walletUsdfc: wallet(10n * ONE), approval: "limited" }), "deposit");
  });

  it("adds funds when the wallet cannot cover the amount, whatever the approval", () => {
    // 5 in the wallet, 10 to add.
    assert.equal(offer({ walletUsdfc: wallet(5n * ONE) }), "add-funds");
    assert.equal(offer({ walletUsdfc: wallet(5n * ONE), approval: "approved" }), "add-funds");
    assert.equal(offer({ walletUsdfc: { state: "unreadable" } }), "add-funds");
  });

  it("is done when nothing is missing, without waiting on the other reads", () => {
    assert.equal(offer({ missing: { kind: "none" }, walletUsdfc: { state: "loading" }, approval: "loading" }), "done");
  });

  it("treats some balance as covered by any USDFC in the wallet", () => {
    assert.equal(offer({ missing: { kind: "any" }, walletUsdfc: wallet(1n) }), "with-approval");
  });

  it("waits for the reads it depends on", () => {
    assert.equal(offer({ missing: null }), "checking");
    assert.equal(offer({ walletUsdfc: { state: "loading" } }), "checking");
    assert.equal(offer({ walletUsdfc: wallet(10n * ONE), approval: "loading" }), "checking");
    // An approval that could not be read may already exist: the approve step offers a Retry, not Add a Service.
    assert.equal(offer({ walletUsdfc: wallet(10n * ONE), approval: "unreadable" }), "checking");
  });
});

describe("shortfallLabel", () => {
  it("names the amount when there is one, and just the token otherwise", () => {
    assert.equal(shortfallLabel({ kind: "amount", amount: 25n * 10n ** 17n }), "2.5 USDFC");
    assert.equal(shortfallLabel({ kind: "any" }), "USDFC");
  });
});

describe("readDepositBaseline", () => {
  const SAVED = 1_700_000_000_000;

  it("reads back what was written, negative baselines included", () => {
    assert.equal(readDepositBaseline(writeDepositBaseline(7n * 10n ** 18n, SAVED), SAVED + 1_000), 7n * 10n ** 18n);
    assert.equal(readDepositBaseline(writeDepositBaseline(-5n, SAVED), SAVED), -5n);
  });

  it("drops a baseline once it is older than the TTL", () => {
    const stored = writeDepositBaseline(1n, SAVED);
    assert.equal(readDepositBaseline(stored, SAVED + DEPOSIT_BASELINE_TTL_MS), 1n);
    assert.equal(readDepositBaseline(stored, SAVED + DEPOSIT_BASELINE_TTL_MS + 1), null);
  });

  it("drops a baseline saved in the future, so a clock change cannot keep it forever", () => {
    assert.equal(readDepositBaseline(writeDepositBaseline(1n, SAVED + 1), SAVED), null);
  });

  it("drops anything it did not write", () => {
    for (const stored of [
      null,
      "",
      "123",
      "not json",
      "null",
      '{"baseline":"1.5","savedAt":1}',
      '{"baseline":1,"savedAt":1}',
      '{"baseline":"1"}',
    ]) {
      assert.equal(readDepositBaseline(stored, SAVED), null, String(stored));
    }
  });
});

describe("groupKeyPhase", () => {
  const groupKey = { groupKeyId: "0x02ca08cf7e0222c8432adc159232b7eb" as const, commitment: null };
  const inconsistent = {
    error: "default-group-key-invalid" as const,
    groupKeyId: "0x02ca08cf7e0222c8432adc159232b7eb" as const,
    dataSetIds: [3n],
  };
  /** Everything in place to sign: each case below changes only what it is about. */
  const ready: GroupKeyReads = {
    signatureValid: true,
    expires: 4_102_444_800n,
    choice: groupKey,
    choiceFailed: false,
    walletReady: true,
    issuing: false,
    issueError: null,
    grant: undefined,
  };
  const declined = new BaseError("Signing failed", { cause: new UserRejectedRequestError(new Error("no")) });

  it("is ready once the signature checks out, the key is authorized, a group key is chosen and the wallet is there", () => {
    assert.deepEqual(groupKeyPhase(ready), { phase: "ready", groupKey });
  });

  it("names each earlier phase from the read it waits on", () => {
    assert.deepEqual(groupKeyPhase({ ...ready, signatureValid: undefined }), { phase: "checking-pubkey" });
    assert.deepEqual(groupKeyPhase({ ...ready, signatureValid: false }), { phase: "unsigned-pubkey" });
    assert.deepEqual(groupKeyPhase({ ...ready, expires: null }), { phase: "waiting-for-key", groupKey });
    assert.deepEqual(groupKeyPhase({ ...ready, expires: null, choice: undefined }), {
      phase: "waiting-for-key",
      groupKey: null,
    });
    assert.deepEqual(groupKeyPhase({ ...ready, choice: undefined }), { phase: "choosing" });
    assert.deepEqual(groupKeyPhase({ ...ready, choice: undefined, choiceFailed: true }), { phase: "read-failed" });
    assert.deepEqual(groupKeyPhase({ ...ready, choice: inconsistent }), {
      phase: "inconsistent-default",
      groupKeyId: inconsistent.groupKeyId,
      dataSetIds: [3n],
    });
    assert.deepEqual(groupKeyPhase({ ...ready, walletReady: false }), { phase: "connecting-wallet", groupKey });
    assert.deepEqual(groupKeyPhase({ ...ready, issuing: true }), { phase: "signing", groupKey });
  });

  it("reports a failed signing, telling a declined prompt from other failures", () => {
    assert.deepEqual(groupKeyPhase({ ...ready, issueError: declined }), {
      phase: "sign-failed",
      groupKey,
      declined: true,
      message: "You declined the signature. No Grant was made.",
    });
    assert.deepEqual(groupKeyPhase({ ...ready, issueError: new BaseError("The wallet could not sign") }), {
      phase: "sign-failed",
      groupKey,
      declined: false,
      message: "The wallet could not sign",
    });
  });

  it("keeps a made Grant whatever the reads say afterwards", () => {
    const after = {
      ...ready,
      grant: "fgr1_x",
      signatureValid: false,
      expires: null,
      choiceFailed: true,
      walletReady: false,
      issueError: declined,
    };
    assert.deepEqual(groupKeyPhase(after), { phase: "issued", grant: "fgr1_x", groupKey });
  });

  it("follows its precedence where reads overlap", () => {
    const failing = { ...ready, choice: undefined, choiceFailed: true };
    // A bad signature blocks everything, read errors included; a pending check comes before them too.
    assert.equal(groupKeyPhase({ ...failing, signatureValid: false }).phase, "unsigned-pubkey");
    assert.equal(groupKeyPhase({ ...failing, signatureValid: undefined }).phase, "checking-pubkey");
    assert.equal(groupKeyPhase({ ...ready, signatureValid: undefined, expires: null }).phase, "checking-pubkey");
    // A failed scan or a broken default warns before the authorization is paid for.
    assert.equal(groupKeyPhase({ ...failing, expires: null }).phase, "read-failed");
    assert.equal(groupKeyPhase({ ...ready, choice: inconsistent, expires: null }).phase, "inconsistent-default");
    // A scan still running before authorization is just waiting for the key.
    assert.equal(groupKeyPhase({ ...ready, expires: null, choice: undefined }).phase, "waiting-for-key");
    // A read error outranks a stale choice; an invalid default outranks the wallet.
    assert.equal(groupKeyPhase({ ...ready, choiceFailed: true }).phase, "read-failed");
    assert.equal(groupKeyPhase({ ...ready, choice: inconsistent, walletReady: false }).phase, "inconsistent-default");
    assert.equal(groupKeyPhase({ ...ready, choice: undefined, walletReady: false }).phase, "choosing");
    // A signature in flight outlasts a wallet client that drops out; Retry needs a wallet.
    assert.equal(groupKeyPhase({ ...ready, issuing: true, walletReady: false }).phase, "signing");
    assert.equal(groupKeyPhase({ ...ready, issueError: declined, walletReady: false }).phase, "connecting-wallet");
    assert.equal(groupKeyPhase({ ...ready, issuing: true, issueError: declined }).phase, "signing");
  });
});

describe("signingFailure", () => {
  it("finds a declined prompt anywhere in the cause chain, by class or by wallet code", () => {
    const wrapped = new BaseError("outer", { cause: new UserRejectedRequestError(new Error("no")) });
    assert.equal(signingFailure(wrapped).declined, true);
    assert.equal(signingFailure({ code: 4001 }).declined, true);
    assert.deepEqual(signingFailure(new Error("boom")), { declined: false, message: "boom" });
  });
});
