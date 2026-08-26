/**
 * A "permission" in SessionKeyRegistry is the EIP-712 typehash of the FWSS
 * operation the key may sign. Constants below are keccak256 of the
 * preimages in filecoin-services v1.3.0 `SignatureVerificationLib.sol`;
 * the unit tests recompute them from the preimages to guard against drift.
 *
 * Canonical source: `DefaultFwssPermissions` in `@filoz/synapse-core/session-key`.
 * The explorer pins `@filoz/synapse-sdk` 0.41, which neither re-exports that
 * module nor ships a synapse-core with the current `TerminateService` hash
 * (0.5.2 still has `DeleteDataSet`). Switch to the import once the SDK is
 * bumped to a version whose synapse-core is 0.7 or newer.
 *
 * NOTE: this module stays free of `@/` imports and side effects so its logic
 \* stays unit-testable in isolation.
 */

export type ScopeId = "createDataSet" | "addPieces" | "schedulePieceRemovals" | "terminateService";

export interface SessionKeyScope {
  id: ScopeId;
  label: string;
  description: string;
  typehash: `0x${string}`;
  /** Grants the key power to remove data or end service — UI flags these. */
  destructive?: boolean;
}

export const SESSION_KEY_SCOPES: SessionKeyScope[] = [
  {
    id: "createDataSet",
    label: "Create data set",
    description: "Key may create new Warm Storage data sets billed to your account.",
    typehash: "0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9",
  },
  {
    id: "addPieces",
    label: "Add pieces",
    description: "Key may add pieces to your existing data sets.",
    typehash: "0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183",
  },
  {
    id: "schedulePieceRemovals",
    label: "Schedule piece removals",
    description: "Key may schedule pieces for removal from your data sets. Removed data is gone once the removal runs.",
    typehash: "0x5415701e313bb627e755b16924727217bb356574fe20e7061442c200b0822b22",
    destructive: true,
  },
  {
    id: "terminateService",
    label: "Terminate service",
    description: "Key may end storage service for whole data sets, which stops proving and payment for them.",
    typehash: "0x522bd88a11de1cdc6574394dde7a21ae488ff13e16e7408d0ea721dd8479dffc",
    destructive: true,
  },
];

export const SCOPE_BY_ID: Record<ScopeId, SessionKeyScope> = Object.fromEntries(
  SESSION_KEY_SCOPES.map((s) => [s.id, s]),
) as Record<ScopeId, SessionKeyScope>;

export type SessionKeyStatus = "active" | "expired" | "revoked";

/** Contract check is `authorizationExpiry(...) >= block.timestamp`, so expiry == now is still active. */
export function isScopeActive(expiry: bigint, nowSec: bigint): boolean {
  return expiry !== 0n && expiry >= nowSec;
}

/**
 * Whole-key status from the per-scope expiries the key was granted:
 * any live scope -> active; all zero -> revoked; otherwise -> expired.
 */
export function deriveKeyStatus(expiries: bigint[], nowSec: bigint): SessionKeyStatus {
  if (expiries.some((e) => isScopeActive(e, nowSec))) return "active";
  if (expiries.every((e) => e === 0n)) return "revoked";
  return "expired";
}

export const EXPIRY_PRESETS: { label: string; seconds: number }[] = [
  { label: "7 days", seconds: 7 * 86400 },
  { label: "30 days", seconds: 30 * 86400 },
  { label: "90 days", seconds: 90 * 86400 },
];

/**
 * Absolute expiry (unix seconds) for the create form. A preset index is a
 * duration added to `nowMs`; "custom" is an absolute `YYYY-MM-DD` taken as
 * end of day in local time. Returns null when the choice is missing or in
 * the past.
 */
export function resolveExpiry(presetIndex: string, customDate: string, nowMs: number): bigint | null {
  const nowSec = Math.floor(nowMs / 1000);
  if (presetIndex === "custom") {
    if (!customDate) return null;
    const ts = Math.floor(new Date(`${customDate}T23:59:59`).getTime() / 1000);
    return ts > nowSec ? BigInt(ts) : null;
  }
  const preset = EXPIRY_PRESETS[Number(presetIndex)];
  return preset ? BigInt(nowSec + preset.seconds) : null;
}

export interface SessionKeyWithStatus extends SessionKeyRecord {
  /** "unknown" until the first chain read resolves. */
  status: SessionKeyStatus | "unknown";
  scopeExpiries: Partial<Record<ScopeId, bigint>>;
  /** Latest expiry across granted scopes (0n if revoked/never). */
  maxExpiry: bigint;
  scopeActive: Partial<Record<ScopeId, boolean>>;
}

/** One `authorizationExpiry` read, in the shape wagmi's useReadContracts returns. */
export interface ExpiryRead {
  status: "success" | "failure";
  result?: unknown;
}

/** A key created this recently reads all-zero until its login confirms, so it is not yet "revoked". */
const FRESH_KEY_MS = 3 * 60_000;

/**
 * Joins each record with its chain reads. `reads` is flat, one entry per
 * record scope in record order, which is how the hook builds the contracts
 * list. A missing or failed read leaves the key "unknown".
 */
export function deriveSessionKeys(
  records: SessionKeyRecord[],
  reads: readonly ExpiryRead[] | undefined,
  nowSec: bigint,
  nowMs: number,
): SessionKeyWithStatus[] {
  let cursor = 0;
  return records.map((record) => {
    const scopeExpiries: Partial<Record<ScopeId, bigint>> = {};
    const scopeActive: Partial<Record<ScopeId, boolean>> = {};
    const expiries: bigint[] = [];
    let resolved = true;
    for (const scopeId of record.scopes) {
      const read = reads?.[cursor];
      cursor += 1;
      if (read?.status === "success" && typeof read.result === "bigint") {
        scopeExpiries[scopeId] = read.result;
        scopeActive[scopeId] = isScopeActive(read.result, nowSec);
        expiries.push(read.result);
      } else {
        resolved = false;
      }
    }
    const maxExpiry = expiries.reduce((max, e) => (e > max ? e : max), 0n);
    let status: SessionKeyWithStatus["status"] =
      resolved && expiries.length > 0 ? deriveKeyStatus(expiries, nowSec) : "unknown";
    if (status === "revoked" && nowMs - record.createdAt < FRESH_KEY_MS) status = "unknown";
    return { ...record, status, scopeExpiries, scopeActive, maxExpiry };
  });
}

export interface SessionKeyRecord {
  name: string;
  sessionKeyPublic: `0x${string}`;
  scopes: ScopeId[];
  createdAt: number;
  txHash?: string;
  /** Present when this record came from a chain sync rather than the local create-key flow. */
  source?: "chain";
  /** Timestamp (ms) of the latest onchain revoke event, known only for synced records. */
  revokedAt?: number;
}

/**
 * Guards against forged or drifted localStorage: one malformed record must
 * never crash the page that revokes keys. Unknown scope ids are dropped
 * (SCOPE_BY_ID lookups on them would throw); records without a valid
 * address or any known scope are rejected entirely.
 */
export function sanitizeRecords(value: unknown): SessionKeyRecord[] {
  if (!Array.isArray(value)) return [];
  const out: SessionKeyRecord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.sessionKeyPublic !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.sessionKeyPublic)) continue;
    if (!Array.isArray(r.scopes)) continue;
    const scopes = r.scopes.filter((s): s is ScopeId => typeof s === "string" && s in SCOPE_BY_ID);
    if (scopes.length === 0) continue;
    // Rebuilds records field-by-field: fields not listed here are DROPPED on
    // every load, so a new SessionKeyRecord field must be added here too.
    out.push({
      // Re-normalized on read: a record written before a stricter rule, or
      // edited by hand, still comes out clean.
      name: normalizeKeyName(typeof r.name === "string" ? r.name : ""),
      sessionKeyPublic: r.sessionKeyPublic as `0x${string}`,
      scopes,
      createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : 0,
      ...(typeof r.txHash === "string" ? { txHash: r.txHash } : {}),
      ...(r.source === "chain" ? { source: "chain" as const } : {}),
      ...(typeof r.revokedAt === "number" && Number.isFinite(r.revokedAt) ? { revokedAt: r.revokedAt } : {}),
    });
  }
  return out;
}

/**
 * Key names reach trusted chrome (toast titles, dialog titles, the download
 * filename) and are stored onchain as the public `origin` field. Cap the
 * length and strip control + bidi-override codepoints so a crafted name
 * can't spoof UI text or disguise the downloaded file's extension.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping controls is the point
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function normalizeKeyName(name: string): string {
  return name.replace(UNSAFE_NAME_CHARS, "").trim().slice(0, 64);
}

/**
 * .env download offered on the reveal screen. Byte-compatible with
 * filecoin-pin's `~/.filecoin-session-key.env` (SESSION_KEY + WALLET_ADDRESS,
 * session address as a comment), so the downloaded file can be saved there
 * as-is and picked up by the CLI.
 */
export function buildEnvSnippet(privateKey: string, sessionKeyAddress: string, accountWalletAddress: string): string {
  return [
    "# Session key for Filecoin Warm Storage — save as ~/.filecoin-session-key.env (chmod 600).",
    "# Treat SESSION_KEY like a password: anyone holding it can use its scopes until expiry.",
    `# session address: ${sessionKeyAddress}`,
    `SESSION_KEY=${privateKey}`,
    `WALLET_ADDRESS=${accountWalletAddress}`,
    "",
  ].join("\n");
}
