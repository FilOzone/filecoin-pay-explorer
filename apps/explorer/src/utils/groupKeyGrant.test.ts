import assert from "node:assert/strict";
import {
  commitment as commitmentOf,
  deriveGroupKey,
  keyForGroup,
  openDelivery,
  publicKeyOf,
  reaches,
} from "@filoz/keysmith";
import { bytesToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, it, vi } from "vitest";

/** Every key handed to rootClaim and every node key it returns, to check they are zeroed after use. */
const held = vi.hoisted(() => [] as Uint8Array[]);
vi.mock("@filoz/keysmith", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@filoz/keysmith")>();
  return {
    ...actual,
    rootClaim: async (...args: Parameters<typeof actual.rootClaim>) => {
      const result = await actual.rootClaim(...args);
      held.push(args[1].groupKey, result.nodeKey);
      return result;
    },
  };
});

import {
  chooseGroupKey,
  defaultGroupKeyId,
  type GroupGrantNode,
  type GroupKeyDataSet,
  groupPath,
  issueGroupKeyGrant,
  MAX_GRANT_DEPTH,
} from "./groupKeyGrant";

// Test keys only: Anvil #0 owns the data, Anvil #1 is the session key.
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const SESSION_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const SESSION = privateKeyToAccount(SESSION_KEY);
const DEFAULT_ID = "0x02ca08cf7e0222c8432adc159232b7eb";

const A = "0x000000000000000000000000000000aa";
const B = "0x000000000000000000000000000000bb";
const dataSet = (dataSetId: bigint, gkid: string, kc: string, enc = "1"): GroupKeyDataSet => ({
  dataSetId,
  metadata: { "foc/gkid": gkid, "foc/kc": kc, "foc/enc": enc },
});

describe("defaultGroupKeyId", () => {
  it("matches the vector shared with filecoin-pin, whatever the address case", () => {
    assert.equal(defaultGroupKeyId(OWNER.address), DEFAULT_ID);
    assert.equal(defaultGroupKeyId(OWNER.address.toLowerCase() as Hex), DEFAULT_ID);
  });
});

describe("chooseGroupKey", () => {
  it("uses the default group key when no data set records one", () => {
    assert.deepEqual(chooseGroupKey(OWNER.address, []), { groupKeyId: DEFAULT_ID, commitment: null });
  });

  it("uses the one valid group key, with its commitment", () => {
    assert.deepEqual(chooseGroupKey(OWNER.address, [dataSet(7n, A, "v2.aa"), dataSet(9n, A, "v2.aa")]), {
      groupKeyId: A,
      commitment: "v2.aa",
    });
  });

  it("takes the group holding the lowest data set id when two are valid", () => {
    const dataSets = [dataSet(5n, B, "v2.bb"), dataSet(3n, A, "v2.aa"), dataSet(2n, B, "v2.bb")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), { groupKeyId: B, commitment: "v2.bb" });
  });

  it("skips a group whose data sets disagree on foc/kc", () => {
    const dataSets = [dataSet(1n, A, "v2.aa"), dataSet(2n, A, "v2.ff"), dataSet(3n, B, "v2.bb")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), { groupKeyId: B, commitment: "v2.bb" });
  });

  it("skips a group with a data set that is not foc/enc 1", () => {
    const dataSets = [dataSet(1n, A, "v2.aa"), dataSet(2n, A, "v2.aa", "2"), dataSet(3n, B, "v2.bb")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), { groupKeyId: B, commitment: "v2.bb" });
    const unversioned = { dataSetId: 1n, metadata: { "foc/gkid": A, "foc/kc": "v2.aa" } };
    assert.deepEqual(chooseGroupKey(OWNER.address, [unversioned]), { groupKeyId: DEFAULT_ID, commitment: null });
  });

  it("skips a group with no commitment", () => {
    const uncommitted = { dataSetId: 1n, metadata: { "foc/gkid": A, "foc/enc": "1" } };
    assert.deepEqual(chooseGroupKey(OWNER.address, [uncommitted]), { groupKeyId: DEFAULT_ID, commitment: null });
  });

  it("refuses the default group key when it is on chain but invalid", () => {
    const dataSets = [dataSet(4n, DEFAULT_ID, "v2.aa", "2")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), {
      error: "default-group-key-invalid",
      groupKeyId: DEFAULT_ID,
      dataSetIds: [4n],
    });
  });

  it("skips a mixed-case lookalike of the default id rather than calling the default invalid", () => {
    const dataSets = [dataSet(4n, DEFAULT_ID.toUpperCase().replace("0X", "0x"), "v2.aa", "2")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), { groupKeyId: DEFAULT_ID, commitment: null });
  });

  it("skips data sets whose foc/gkid is not a canonical lowercase id, without merging case variants", () => {
    const upper = A.toUpperCase().replace("0X", "0x");
    // Oldest, valid on its own, and the same id as A ignoring case: still skipped, and not merged into A.
    const dataSets = [dataSet(1n, upper, "v2.ff"), dataSet(2n, A, "v2.aa"), dataSet(3n, B, "v2.bb")];
    assert.deepEqual(chooseGroupKey(OWNER.address, dataSets), { groupKeyId: A, commitment: "v2.aa" });
    for (const gkid of [A.slice(0, -2), `0x${"zz".repeat(16)}`, A.slice(2), `${A}00`, ""]) {
      assert.deepEqual(
        chooseGroupKey(OWNER.address, [dataSet(1n, gkid, "v2.ff"), dataSet(2n, B, "v2.bb")]),
        { groupKeyId: B, commitment: "v2.bb" },
        gkid,
      );
    }
  });
});

describe("issueGroupKeyGrant", () => {
  const EXPIRES = 4_102_444_800n; // 2100-01-01
  const input = {
    owner: OWNER.address,
    groupKeyId: DEFAULT_ID as Hex,
    chainId: 314159,
    bearer: SESSION.address,
    pubkey: publicKeyOf(SESSION_KEY),
    node: "groupKey" as GroupGrantNode,
    maxDepth: MAX_GRANT_DEPTH,
    expires: EXPIRES,
  };
  const decode = (text: string) => {
    assert.match(text, /^fgr1_[A-Za-z0-9_-]+$/);
    return Uint8Array.from(Buffer.from(text.slice("fgr1_".length), "base64url"));
  };

  it("issues a Grant the session key opens to the group key, naming the owner, network and expiry", async () => {
    const wallet = { signTypedData: vi.fn(OWNER.signTypedData) };
    const text = await issueGroupKeyGrant(wallet, { ...input, commitment: null });
    // A new group key: two GroupKey signatures, then the ReadGrant.
    assert.deepEqual(
      wallet.signTypedData.mock.calls.map(([args]) => args.primaryType),
      ["GroupKey", "GroupKey", "ReadGrant"],
    );

    const { key, claim, grant, chain } = await openDelivery(SESSION_KEY, decode(text), { now: 1_800_000_000 });
    const { groupKey } = await deriveGroupKey(OWNER, { owner: OWNER.address, groupKeyId: DEFAULT_ID });
    assert.equal(bytesToHex(key), bytesToHex(groupKey));
    assert.deepEqual(
      {
        owner: claim.owner,
        groupKeyId: claim.groupKeyId,
        bearer: claim.bearer,
        chainId: claim.chainId,
        expires: claim.expires,
        node: claim.node,
        maxDepth: chain.links.map((link) => link.maxDepth),
      },
      {
        owner: OWNER.address,
        groupKeyId: DEFAULT_ID,
        bearer: SESSION.address,
        chainId: 314159n,
        expires: Number(EXPIRES),
        node: "groupKey",
        maxDepth: [7],
      },
    );
    assert.deepEqual(
      { v: grant.v, node: grant.node, groupKeyId: grant.groupKeyId },
      { v: 2, node: "groupKey", groupKeyId: DEFAULT_ID },
    );
  });

  it("issues a group Grant that opens only that group, with the depth the link asked for", async () => {
    const text = await issueGroupKeyGrant(OWNER, {
      ...input,
      commitment: null,
      node: "group:photos/2026",
      maxDepth: 2,
    });
    const { key, claim, grant, chain } = await openDelivery(SESSION_KEY, decode(text), { now: 1_800_000_000 });
    const { groupKey } = await deriveGroupKey(OWNER, { owner: OWNER.address, groupKeyId: DEFAULT_ID });
    // The group's key, not the group key: what filecoin-pin derives for pieces under photos/2026.
    assert.equal(bytesToHex(key), bytesToHex(keyForGroup(groupKey, "photos/2026")));
    assert.notEqual(bytesToHex(key), bytesToHex(groupKey));
    assert.equal(claim.node, "group:photos/2026");
    assert.equal(claim.expires, Number(EXPIRES));
    assert.deepEqual({ v: grant.v, node: grant.node }, { v: 2, node: "group:photos/2026" });
    assert.deepEqual(
      chain.links.map((link) => link.maxDepth),
      [2],
    );
    const piece = (group: string) => ({ "foc/gkid": DEFAULT_ID, "foc/group": group, "foc/salt": "0x01" });
    assert.equal(reaches(claim.node, piece("photos/2026/may")), true);
    assert.equal(reaches(claim.node, piece("photos/2025")), false);
    assert.equal(reaches(claim.node, piece("photos")), false);
  });

  it("signs maxDepth 0 when the link allows no onward delegation", async () => {
    const text = await issueGroupKeyGrant(OWNER, { ...input, commitment: null, maxDepth: 0 });
    const { chain } = await openDelivery(SESSION_KEY, decode(text), { now: 1_800_000_000 });
    assert.deepEqual(
      chain.links.map((link) => link.maxDepth),
      [0],
    );
  });

  it("encodes the Grant without padding whatever its length, as on mainnet", async () => {
    // Mainnet's shorter chain id leaves the delivery one byte past a multiple of three.
    const text = await issueGroupKeyGrant(OWNER, { ...input, chainId: 314, commitment: null });
    const { claim } = await openDelivery(SESSION_KEY, decode(text), { now: 1_800_000_000 });
    assert.equal(claim.chainId, 314n);
  });

  it("signs once for a group key with a recorded commitment, and refuses a commitment that does not match", async () => {
    const { groupKey } = await deriveGroupKey(OWNER, { owner: OWNER.address, groupKeyId: A });
    const wallet = { signTypedData: vi.fn(OWNER.signTypedData) };
    assert.match(commitmentOf(groupKey), /^v2\.[0-9a-f]{32}$/);
    const text = await issueGroupKeyGrant(wallet, { ...input, groupKeyId: A, commitment: commitmentOf(groupKey) });
    assert.deepEqual(
      wallet.signTypedData.mock.calls.map(([args]) => args.primaryType),
      ["GroupKey", "ReadGrant"],
    );
    const { key } = await openDelivery(SESSION_KEY, decode(text), { now: 1_800_000_000 });
    assert.equal(bytesToHex(key), bytesToHex(groupKey));

    await assert.rejects(
      issueGroupKeyGrant(OWNER, { ...input, groupKeyId: B, commitment: commitmentOf(groupKey) }),
      /does not match the recorded commitment/,
    );
  });

  it("zeroes the group key and the node key once the Grant is made", async () => {
    held.length = 0;
    await issueGroupKeyGrant(OWNER, { ...input, commitment: null });
    assert.equal(held.length, 2);
    for (const key of held) assert.ok(key.every((byte) => byte === 0));
  });
});

describe("groupPath", () => {
  it("keeps a valid path, in Keysmith's canonical form", () => {
    assert.equal(groupPath("photos/2026"), "photos/2026");
    assert.equal(groupPath("caf\u0065\u0301"), "caf\u00e9");
  });

  it("refuses what Keysmith would, without throwing", () => {
    for (const path of ["", "/", "a/", "/a", "a//b", " a", "a /b", "\ud800"]) {
      assert.equal(groupPath(path), null, JSON.stringify(path));
    }
  });
});
