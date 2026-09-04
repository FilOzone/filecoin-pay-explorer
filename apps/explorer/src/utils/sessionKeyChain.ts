/**
 * Chain-history client for the session-keys page: fetches and decodes
 * `AuthorizationsUpdated` logs from the network's default block explorer.
 * Kept apart from `sessionKeySync.ts`, which stays free of `@/` imports so
 * its fold/merge logic is unit-testable in isolation; this module owns the
 * network I/O and viem decoding.
 */
import { type AbiEvent, decodeEventLog, encodeEventTopics, getAbiItem, type Hex, pad } from "viem";
import { type Chain, getChain } from "@/constants/chains";
import type { Network } from "@/types";
import type { DecodedAuthorizationEvent } from "@/utils/sessionKeySync";

/** Block the registry was deployed at on each network — the earliest an `AuthorizationsUpdated` log can exist. */
const REGISTRY_DEPLOY_BLOCK: Record<Network, bigint> = {
  mainnet: 5459604n,
  calibration: 3185523n,
};

/** Shape of one entry in Blockscout's Etherscan-compatible `getLogs` response. */
export interface BlockscoutLogEntry {
  data: string;
  topics: (string | null)[];
  blockNumber: string;
  logIndex: string;
  timeStamp?: string;
}

/** Blockscout returns at most this many logs per request and ignores page/offset. */
const PAGE_SIZE = 1000;

/**
 * Fetches and decodes every `AuthorizationsUpdated` log for one wallet from
 * the network's default block explorer (Blockscout's Etherscan-compatible
 * `getLogs`). Results are capped at PAGE_SIZE per request with no paging
 * parameters, so a full page is followed by another request from the last
 * block seen, deduped on the boundary block.
 */
export async function fetchAuthorizationEvents(
  network: Network,
  registry: Chain["contracts"]["sessionKeyRegistry"],
  account: Hex,
): Promise<DecodedAuthorizationEvent[]> {
  const event = getAbiItem({ abi: registry.abi, name: "AuthorizationsUpdated" });
  if (event?.type !== "event") throw new Error("SessionKeyRegistry ABI is missing AuthorizationsUpdated");

  const [topic0] = encodeEventTopics({ abi: [event], eventName: "AuthorizationsUpdated" });
  const topic1 = pad(account, { size: 32 }).toLowerCase();

  const blockExplorerUrl = getChain(network).blockExplorers?.default?.url;
  if (!blockExplorerUrl) throw new Error(`${network} chain has no default block explorer configured`);
  const url = new URL("/api", blockExplorerUrl);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", registry.address);
  url.searchParams.set("topic0", topic0);
  url.searchParams.set("topic1", topic1);
  url.searchParams.set("topic0_1_opr", "and");
  url.searchParams.set("toBlock", "latest");

  const rawLogs: BlockscoutLogEntry[] = [];
  const seen = new Set<string>();
  let fromBlock = REGISTRY_DEPLOY_BLOCK[network];
  for (;;) {
    url.searchParams.set("fromBlock", fromBlock.toString());
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Blockscout request failed (${response.status})`);
    const body = (await response.json()) as { status: string; message: string; result: unknown };
    if (!Array.isArray(body.result) && body.status !== "1") {
      throw new Error(body.message || "Blockscout request failed");
    }
    const page = Array.isArray(body.result) ? (body.result as BlockscoutLogEntry[]) : [];
    let added = 0;
    for (const log of page) {
      const id = `${log.blockNumber}:${log.logIndex}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rawLogs.push(log);
      added += 1;
    }
    if (page.length < PAGE_SIZE) break;
    // A full page with nothing new means the range cannot advance: one block
    // holds more logs than a page, and block ranges cannot split a block.
    if (added === 0) throw new Error(`Blockscout returned more logs at block ${fromBlock} than one page holds`);
    fromBlock = page.reduce((max, log) => (BigInt(log.blockNumber) > max ? BigInt(log.blockNumber) : max), 0n);
  }

  return decodeAuthorizationLogs(rawLogs, event, topic0, topic1, getChain(network).genesisTimestamp);
}

/**
 * Decodes raw `getLogs` rows, keeping only logs of this event for this
 * wallet. Blockscout's `topic0`/`topic1` filters silently fall back to "no
 * filter" instead of an empty result when a value has never appeared in the
 * contract's logs, so every row is re-checked against both before it is
 * trusted: a wallet with zero grants must never see someone else's keys.
 */
export function decodeAuthorizationLogs(
  rawLogs: BlockscoutLogEntry[],
  event: AbiEvent,
  topic0: Hex,
  topic1: string,
  genesisTimestamp: number,
): DecodedAuthorizationEvent[] {
  const events: DecodedAuthorizationEvent[] = [];
  for (const log of rawLogs) {
    if ((log.topics[0] ?? "").toLowerCase() !== topic0.toLowerCase()) continue;
    if ((log.topics[1] ?? "").toLowerCase() !== topic1.toLowerCase()) continue;

    const decoded = decodeEventLog({
      abi: [event],
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
    });
    const { signer, expiry, permissions, origin } = decoded.args as {
      signer: Hex;
      expiry: bigint;
      permissions: readonly Hex[];
      origin: string;
    };
    const blockNumber = BigInt(log.blockNumber);
    // Blockscout's Etherscan-compatible endpoint usually includes timeStamp; fall back to the
    // network's fixed ~30s block time from genesis when it's missing.
    const timestamp = log.timeStamp ? Number(BigInt(log.timeStamp)) : genesisTimestamp + Number(blockNumber) * 30;
    events.push({
      signer,
      expiry,
      permissions: [...permissions],
      origin,
      timestamp,
      blockNumber,
      logIndex: Number(BigInt(log.logIndex)),
    });
  }
  return events;
}
