/**
 * Pure logic for the console's Session Keys page.
 *
 * A "permission" in SessionKeyRegistry is the EIP-712 typehash of the FWSS
 * operation the key may sign. Constants below are keccak256 of the
 * preimages in filecoin-services v1.3.0 `SignatureVerificationLib.sol`;
 * the unit tests recompute them from the preimages to guard against drift.
 *
 * NOTE: this module stays free of `@/` imports so `node --test` can run it directly.
 */
import { decodeEventLog, parseAbiItem } from "viem";

export type ScopeId = "createDataSet" | "addPieces";
export type SessionKeyNetwork = "calibration" | "mainnet";

export interface SessionKeyScope {
  id: ScopeId;
  label: string;
  description: string;
  typehash: `0x${string}`;
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
];

export const SCOPE_BY_ID: Record<ScopeId, SessionKeyScope> = Object.fromEntries(
  SESSION_KEY_SCOPES.map((s) => [s.id, s]),
) as Record<ScopeId, SessionKeyScope>;

const SCOPE_ID_BY_TYPEHASH: Record<string, ScopeId> = Object.fromEntries(
  SESSION_KEY_SCOPES.map((s) => [s.typehash.toLowerCase(), s.id]),
);

export type SessionKeyStatus = "active" | "expired" | "revoked" | "notFound";

/** Contract check is `authorizationExpiry(...) >= block.timestamp`, so expiry == now is still active. */
export function isScopeActive(expiry: bigint, nowSec: bigint): boolean {
  return expiry !== 0n && expiry >= nowSec;
}

/**
 * Whole-key status from the per-scope expiries the key was granted:
 * any live scope -> active; all zero -> revoked (callers map file-imported
 * keys to "notFound" since they carry no proof the key ever existed); otherwise -> expired.
 */
export function deriveKeyStatus(expiries: bigint[], nowSec: bigint): "active" | "expired" | "revoked" {
  if (expiries.some((e) => isScopeActive(e, nowSec))) return "active";
  if (expiries.every((e) => e === 0n)) return "revoked";
  return "expired";
}

export const EXPIRY_PRESETS: { label: string; seconds: number }[] = [
  { label: "7 days", seconds: 7 * 86400 },
  { label: "30 days", seconds: 30 * 86400 },
  { label: "90 days", seconds: 90 * 86400 },
];

export type SessionKeySource = "created" | "file" | "chain";

export interface SessionKeyRecord {
  name: string;
  sessionKeyPublic: `0x${string}`;
  scopes: ScopeId[];
  createdAt: number;
  txHash?: string;
  source: SessionKeySource;
}

const INVENTORY_VERSION = 1;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Secret-free inventory file: name + session key public address + scopes only — never key material. */
export function serializeInventory(network: string, accountAddress: string, keys: SessionKeyRecord[]): string {
  return JSON.stringify(
    {
      version: INVENTORY_VERSION,
      network,
      accountAddress,
      sessionKeys: keys.map(({ name, sessionKeyPublic, scopes, createdAt }) => ({
        name,
        sessionKeyPublic,
        scopes,
        createdAt,
      })),
    },
    null,
    2,
  );
}

export function parseInventoryFile(
  json: string,
  expected: { network: string; accountAddress: string },
): SessionKeyRecord[] {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Not an inventory file.");
  const data = parsed as Partial<{ version: number; network: string; accountAddress: string; sessionKeys: unknown[] }>;
  if (data.version !== INVENTORY_VERSION) {
    throw new Error(`Unsupported inventory file version (expected ${INVENTORY_VERSION}).`);
  }
  if (data.network !== expected.network) {
    throw new Error(`This file is for the ${data.network} network; you are connected to ${expected.network}.`);
  }
  if (
    typeof data.accountAddress !== "string" ||
    data.accountAddress.toLowerCase() !== expected.accountAddress.toLowerCase()
  ) {
    throw new Error("This file belongs to a different wallet than the one connected.");
  }
  if (!Array.isArray(data.sessionKeys)) throw new Error("Inventory file has no sessionKeys array.");
  return data.sessionKeys.map((k: unknown, i: number): SessionKeyRecord => {
    const rec = k as Partial<SessionKeyRecord>;
    // name is optional: the chain doesn't require an origin, so neither do we
    const name = typeof rec.name === "string" && rec.name.length > 0 ? rec.name : "(unnamed)";
    if (typeof rec.sessionKeyPublic !== "string" || !ADDRESS_RE.test(rec.sessionKeyPublic)) {
      throw new Error(`Key #${i + 1} ("${name}"): invalid sessionKeyPublic address.`);
    }
    if (!Array.isArray(rec.scopes) || rec.scopes.length === 0 || rec.scopes.some((s) => !(s in SCOPE_BY_ID))) {
      throw new Error(`Key "${name}": unknown scope.`);
    }
    return {
      name,
      sessionKeyPublic: rec.sessionKeyPublic as `0x${string}`,
      scopes: rec.scopes as ScopeId[],
      createdAt: typeof rec.createdAt === "number" ? rec.createdAt : 0,
      source: "file",
    };
  });
}

/** .env download offered on the reveal screen. */
export function buildEnvSnippet(privateKey: string, sessionKeyAddress: string, accountWalletAddress: string): string {
  return [
    "# Session key for Filecoin Warm Storage",
    "# Treat SESSION_KEY_PRIVATE like a password: anyone holding it can use its scopes until expiry.",
    `SESSION_KEY_PRIVATE=${privateKey}`,
    `SESSION_KEY_ADDRESS=${sessionKeyAddress}`,
    `ACCOUNT_WALLET_ADDRESS=${accountWalletAddress}`,
    "",
  ].join("\n");
}

// ============================================================================
// Import from chain: chunked eth_getLogs over AuthorizationsUpdated.
// MUST use Filfox RPC — Glif silently returns empty for old ranges,
// and Ankr caps lookback at 24h.
// ============================================================================

export const AUTHORIZATIONS_UPDATED_EVENT = parseAbiItem(
  "event AuthorizationsUpdated(address indexed identity, address signer, uint256 expiry, bytes32[] permissions, string origin)",
);

const AUTHORIZATIONS_UPDATED_TOPIC = "0x12b32aa5a9f9ab940b704a81602a4d1ba5066d82c4e4a5cbf13fce29771b675f";

export const LOG_SCAN_RPC: Record<SessionKeyNetwork, string> = {
  calibration: "https://calibration.filfox.info/rpc/v1",
  mainnet: "https://filfox.info/rpc/v1",
};

/** Registry deployment epochs (deployed_at 2026-05-28T10:05Z, deployments.json v1.3.0), rounded down. */
export const REGISTRY_DEPLOY_EPOCH: Record<SessionKeyNetwork, number> = {
  calibration: 3_766_000, // genesis 1667326380
  mainnet: 6_066_000, // genesis 1598306400
};

const GENESIS_TIMESTAMP: Record<SessionKeyNetwork, number> = {
  calibration: 1667326380,
  mainnet: 1598306400,
};

const LOG_CHUNK_EPOCHS = 2880; // Filfox getLogs hard cap (error -32005 beyond it)
const LOG_SCAN_PARALLELISM = 10;

export interface AuthorizationEvent {
  signer: `0x${string}`;
  expiry: bigint;
  scopes: ScopeId[];
  origin: string;
  /** Unix ms, derived deterministically from the epoch (Filecoin: genesis + epoch * 30s). */
  timestamp: number;
}

interface RawLog {
  data: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
  blockNumber: `0x${string}`;
}

/**
 * Fold a chronological event stream into one record per session key.
 * Name comes from the origin of the most recent grant (expiry > 0),
 * createdAt from the first event; scopes are the union of known scopes
 * ever granted. Keys whose events only carry scopes outside v1 are skipped.
 */
export function foldAuthorizationEvents(events: AuthorizationEvent[]): SessionKeyRecord[] {
  const byKey = new Map<
    string,
    { name: string; sessionKeyPublic: `0x${string}`; scopes: Set<ScopeId>; createdAt: number }
  >();
  for (const ev of events) {
    if (ev.scopes.length === 0) continue; // only unknown/out-of-scope permissions
    const id = ev.signer.toLowerCase();
    const existing = byKey.get(id);
    if (!existing) {
      byKey.set(id, {
        name: ev.origin || "(unnamed)",
        sessionKeyPublic: ev.signer,
        scopes: new Set(ev.scopes),
        createdAt: ev.timestamp,
      });
      continue;
    }
    for (const s of ev.scopes) existing.scopes.add(s);
    if (ev.expiry > 0n && ev.origin) existing.name = ev.origin; // latest grant names the key
  }
  return [...byKey.values()].map((k) => ({
    name: k.name,
    sessionKeyPublic: k.sessionKeyPublic,
    scopes: [...k.scopes],
    createdAt: k.createdAt,
    source: "chain" as const,
  }));
}

async function rpcCall(rpc: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

/**
 * Scan the registry's full event history for keys authorized by `account`.
 * ~65 chunks / ~5s on calibration today (measured); grows ~1 chunk per day.
 */
export async function scanChainForSessionKeys(
  network: SessionKeyNetwork,
  registryAddress: `0x${string}`,
  account: `0x${string}`,
): Promise<SessionKeyRecord[]> {
  const rpc = LOG_SCAN_RPC[network];
  const latest = Number(await rpcCall(rpc, "eth_blockNumber", []));
  const identityTopic = `0x000000000000000000000000${account.slice(2).toLowerCase()}`;

  const ranges: [number, number][] = [];
  for (let from = REGISTRY_DEPLOY_EPOCH[network]; from <= latest; from += LOG_CHUNK_EPOCHS) {
    ranges.push([from, Math.min(from + LOG_CHUNK_EPOCHS - 1, latest)]);
  }

  const logs: RawLog[] = [];
  for (let i = 0; i < ranges.length; i += LOG_SCAN_PARALLELISM) {
    const batch = await Promise.all(
      ranges.slice(i, i + LOG_SCAN_PARALLELISM).map(
        ([from, to]) =>
          rpcCall(rpc, "eth_getLogs", [
            {
              address: registryAddress,
              topics: [AUTHORIZATIONS_UPDATED_TOPIC, identityTopic],
              fromBlock: `0x${from.toString(16)}`,
              toBlock: `0x${to.toString(16)}`,
            },
          ]) as Promise<RawLog[]>,
      ),
    );
    logs.push(...batch.flat());
  }

  logs.sort((a, b) => Number.parseInt(a.blockNumber, 16) - Number.parseInt(b.blockNumber, 16));
  const events: AuthorizationEvent[] = logs.map((log) => {
    const decoded = decodeEventLog({ abi: [AUTHORIZATIONS_UPDATED_EVENT], data: log.data, topics: log.topics });
    const epoch = Number.parseInt(log.blockNumber, 16);
    return {
      signer: decoded.args.signer,
      expiry: decoded.args.expiry,
      scopes: decoded.args.permissions
        .map((p) => SCOPE_ID_BY_TYPEHASH[p.toLowerCase()])
        .filter((s): s is ScopeId => s !== undefined),
      origin: decoded.args.origin,
      timestamp: (GENESIS_TIMESTAMP[network] + epoch * 30) * 1000,
    };
  });
  return foldAuthorizationEvents(events);
}
