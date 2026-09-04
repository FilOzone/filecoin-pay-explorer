import { calibration } from "@filoz/synapse-sdk";
import { encodeAbiParameters, encodeEventTopics, getAbiItem, type Hex, pad } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BlockscoutLogEntry, decodeAuthorizationLogs, fetchAuthorizationEvents } from "./sessionKeyChain";

const registry = calibration.contracts.sessionKeyRegistry;
const event = getAbiItem({ abi: registry.abi, name: "AuthorizationsUpdated" });
if (event?.type !== "event") throw new Error("test setup: event missing");

const OWNER = "0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const STRANGER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const SIGNER = "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as const;
const PERMISSION = `0x${"ab".repeat(32)}` as Hex;

const [topic0] = encodeEventTopics({ abi: [event], eventName: "AuthorizationsUpdated" });
const topicFor = (identity: Hex) => pad(identity, { size: 32 }).toLowerCase();

/** One raw Blockscout row: a real ABI encoding of AuthorizationsUpdated(identity, signer, expiry, permissions, origin). */
function row(identity: Hex, block: number, logIndex = 0, expiry = 100n): BlockscoutLogEntry {
  const data = encodeAbiParameters(
    [
      { type: "address", name: "signer" },
      { type: "uint256", name: "expiry" },
      { type: "bytes32[]", name: "permissions" },
      { type: "string", name: "origin" },
    ],
    [SIGNER, expiry, [PERMISSION], "ci"],
  );
  return {
    data,
    topics: [topic0, topicFor(identity)],
    blockNumber: `0x${block.toString(16)}`,
    logIndex: `0x${logIndex.toString(16)}`,
    timeStamp: "0x10",
  };
}

describe("decodeAuthorizationLogs", () => {
  it("decodes this wallet's logs and drops another wallet's or another event's rows", () => {
    const foreignEvent = { ...row(OWNER, 5), topics: [`0x${"11".repeat(32)}`, topicFor(OWNER)] };
    const events = decodeAuthorizationLogs(
      [row(OWNER, 5), row(STRANGER, 6), foreignEvent],
      event,
      topic0,
      topicFor(OWNER),
      0,
    );
    expect(events).toEqual([
      {
        signer: SIGNER,
        expiry: 100n,
        permissions: [PERMISSION],
        origin: "ci",
        timestamp: 16,
        blockNumber: 5n,
        logIndex: 0,
      },
    ]);
  });
});

describe("fetchAuthorizationEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("walks past Blockscout's 1000-row cap by continuing from the last block, without double counting", async () => {
    // Page 1 fills the cap and ends at block 2000; page 2 starts at 2000 (repeating that row) and is short.
    const page1 = Array.from({ length: 1000 }, (_, i) => row(OWNER, 1000 + i, 0));
    const page2 = [row(OWNER, 2000 - 1, 0), row(OWNER, 3000, 0), row(OWNER, 3000, 1)];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      calls.push(new URL(input).searchParams.get("fromBlock") ?? "");
      const result = calls.length === 1 ? page1 : page2;
      return { ok: true, json: async () => ({ status: "1", message: "OK", result }) };
    });

    const events = await fetchAuthorizationEvents("calibration", registry, OWNER);

    expect(calls).toEqual(["3185523", "1999"]);
    expect(events).toHaveLength(1002);
    expect(events.at(-1)).toMatchObject({ blockNumber: 3000n, logIndex: 1 });
  });
});
