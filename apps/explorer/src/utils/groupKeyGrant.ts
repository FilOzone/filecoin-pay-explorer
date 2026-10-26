/**
 * Group key Grants for the setup page. filecoin-pin calls a Keysmith
 * *keyspace* a **group key**; the on-chain labels keep Keysmith's names
 * (`foc/ks`, `foc/kc`). The owner's wallet signs for one group key, and the
 * page wraps that key to the session key's key-agreement key, so the CLI can
 * encrypt and decrypt without the wallet.
 *
 * Which group key is a rule shared with `filecoin-pin add --encrypt`
 * (`src/common/group-key.ts` there), so the console and the CLI always agree.
 */
import {
  COMMITMENT_KEY,
  encodeDelivery,
  grantDescriptor,
  KEYSPACE_ID_KEY,
  keyspaceKeys,
  rootClaim,
  type TypedDataSigner,
  wrapTo,
} from "@filoz/keysmith";
import { type Address, concat, type Hex, keccak256, slice, toHex } from "viem";

/** Data set metadata key that marks a data set as encrypted and versions its rules. */
export const ENCRYPTION_VERSION_KEY = "foc/enc";
const ENCRYPTION_VERSION = "1";

/** What the console text calls the Grant: a prefix the CLI checks, then base64url without padding. */
export const GRANT_PREFIX = "fgr1_";

/** A live data set that records a group key; others never take part in the choice. */
export interface GroupKeyDataSet {
  dataSetId: bigint;
  metadata: Record<string, string>;
}

/**
 * The id of an owner's first group key, so every client that sets one up before
 * any upload picks the same one: `keccak256(utf8("filecoin/default-group-key") ‖ owner)[0:16]`,
 * with the owner as 20 raw bytes.
 */
export function defaultGroupKeyId(owner: Address): Hex {
  return slice(keccak256(concat([toHex("filecoin/default-group-key"), owner])), 0, 16);
}

export type GroupKeyChoice =
  /** `commitment` is the group's `foc/kc`, or null for a group key no data set records yet. */
  | { groupKeyId: Hex; commitment: string | null }
  /** The default id is on chain, but its data sets are not a valid group: signing for it would grow a broken one. */
  | { error: "default-group-key-invalid"; groupKeyId: Hex; dataSetIds: bigint[] };

/**
 * "Oldest wins": group the data sets by `foc/ks`, skip any group whose data sets
 * disagree on `foc/kc` or are not all `foc/enc` "1", and take the group holding
 * the lowest data set id. With none left, the owner's default group key.
 */
export function chooseGroupKey(owner: Address, dataSets: readonly GroupKeyDataSet[]): GroupKeyChoice {
  const groups = Map.groupBy(dataSets, (dataSet) => dataSet.metadata[KEYSPACE_ID_KEY]);
  let best: { groupKeyId: Hex; commitment: string; oldest: bigint } | undefined;
  for (const [groupKeyId, members] of groups) {
    if (groupKeyId === undefined) continue;
    const commitment = members[0]?.metadata[COMMITMENT_KEY];
    const agreed = members.every((dataSet) => dataSet.metadata[COMMITMENT_KEY] === commitment);
    const versioned = members.every((dataSet) => dataSet.metadata[ENCRYPTION_VERSION_KEY] === ENCRYPTION_VERSION);
    if (commitment === undefined || !agreed || !versioned) continue;
    const oldest = members.reduce((min, { dataSetId }) => (dataSetId < min ? dataSetId : min), members[0].dataSetId);
    if (!best || oldest < best.oldest) best = { groupKeyId: groupKeyId as Hex, commitment, oldest };
  }
  if (best) return { groupKeyId: best.groupKeyId, commitment: best.commitment };

  const groupKeyId = defaultGroupKeyId(owner);
  const invalid = dataSets.filter((dataSet) => dataSet.metadata[KEYSPACE_ID_KEY]?.toLowerCase() === groupKeyId);
  if (invalid.length > 0) {
    return { error: "default-group-key-invalid", groupKeyId, dataSetIds: invalid.map(({ dataSetId }) => dataSetId) };
  }
  return { groupKeyId, commitment: null };
}

export interface GroupKeyGrantInput {
  owner: Address;
  groupKeyId: Hex;
  /** The group's `foc/kc`; null for a new group key, which costs a second signature to check determinism. */
  commitment: string | null;
  chainId: number;
  /** The session key's address: the claim's bearer. */
  bearer: Address;
  /** The session key's key-agreement key, which the Grant is wrapped to. */
  pubkey: Hex;
  /** Unix seconds: the session key's authorization expiry. Revoking the key does not end the claim sooner. */
  expires: bigint;
}

/**
 * The owner's wallet signs for the group key (once, or twice for a new one),
 * then signs the claim chain's root for the session key; the group key is
 * wrapped to the session key and zeroed. Returns the Grant as the CLI reads it.
 *
 * @throws If the wallet is not the owner, signs non-deterministically, or derives
 * a key that does not match the recorded commitment.
 */
export async function issueGroupKeyGrant(wallet: TypedDataSigner, input: GroupKeyGrantInput): Promise<string> {
  const ref = { owner: input.owner, keyspace: input.groupKeyId };
  const { kk } = await keyspaceKeys(wallet, ref, input.commitment ? { commitment: input.commitment } : {});
  try {
    const { chain, nodeKey } = await rootClaim(wallet, {
      ...ref,
      chainId: BigInt(input.chainId),
      kk,
      node: "keyspace",
      bearer: input.bearer,
      maxDepth: 0,
      expires: Number(input.expires),
    });
    try {
      const grant = await wrapTo(input.pubkey, nodeKey, grantDescriptor(ref, "keyspace"));
      return GRANT_PREFIX + base64url(encodeDelivery(chain, grant));
    } finally {
      nodeKey.fill(0);
    }
  } finally {
    kk.fill(0);
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
