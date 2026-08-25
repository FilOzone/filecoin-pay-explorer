/**
 * A "permission" in SessionKeyRegistry is the EIP-712 typehash of the FWSS
 * operation the key may sign. Constants below are keccak256 of the
 * preimages in filecoin-services v1.3.0 `SignatureVerificationLib.sol`;
 * the unit tests recompute them from the preimages to guard against drift.
 *
 * NOTE: this module stays free of `@/` imports so `node --test` can run it directly.
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
    description: "Key may create new Warm Storage datasets billed to your account (signs CreateDataSet).",
    typehash: "0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9",
  },
  {
    id: "addPieces",
    label: "Add pieces",
    description: "Key may add pieces to your existing datasets (signs AddPieces).",
    typehash: "0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183",
  },
  {
    id: "schedulePieceRemovals",
    label: "Schedule piece removals",
    description:
      "Key may schedule pieces for removal from your datasets (signs SchedulePieceRemovals). Removed data is gone once the removal executes.",
    typehash: "0x5415701e313bb627e755b16924727217bb356574fe20e7061442c200b0822b22",
    destructive: true,
  },
  {
    id: "terminateService",
    label: "Terminate service",
    description:
      "Key may terminate storage service for entire datasets (signs TerminateService). Ends proving and payment for the dataset.",
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

export interface SessionKeyRecord {
  name: string;
  sessionKeyPublic: `0x${string}`;
  scopes: ScopeId[];
  createdAt: number;
  txHash?: string;
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
