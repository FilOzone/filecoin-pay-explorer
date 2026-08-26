/**
 * Chain-history client for the session-keys page: fetches and decodes
 * `AuthorizationsUpdated` logs from the network's default block explorer.
 * Kept apart from `sessionKeySync.ts`, which stays free of `@/` imports so
 * its fold/merge logic is unit-testable in isolation; this module owns the
 * network I/O and viem decoding.
 */
import { decodeEventLog, encodeEventTopics, getAbiItem, type Hex, pad } from "viem";
import { type Chain, getChain } from "@/constants/chains";
import type { Network } from "@/types";
import type { DecodedAuthorizationEvent } from "@/utils/sessionKeySync";

/** Block the registry was deployed at on each network — the earliest an `AuthorizationsUpdated` log can exist. */
const REGISTRY_DEPLOY_BLOCK: Record<Network, bigint> = {
  mainnet: 5459604n,
  calibration: 3185523n,
};

/** Shape of one entry in Blockscout's Etherscan-compatible `getLogs` response. */
interface BlockscoutLogEntry {
  data: string;
  topics: (string | null)[];
  blockNumber: string;
  logIndex: string;
  timeStamp?: string;
}

/**
 * Fetches and decodes every `AuthorizationsUpdated` log for one wallet from
 * the network's default block explorer (Blockscout's Etherscan-compatible
 * `getLogs`). Blockscout's `topic0`/`topic1` filters silently fall back to
 * "no filter" instead of an empty result when a value has never appeared in
 * this contract's logs, so every log is re-checked against both before it's
 * trusted — a wallet with zero grants must never see someone else's keys.
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
  url.searchParams.set("fromBlock", REGISTRY_DEPLOY_BLOCK[network].toString());
  url.searchParams.set("toBlock", "latest");

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Blockscout request failed (${response.status})`);
  const body = (await response.json()) as { status: string; message: string; result: unknown };
  if (!Array.isArray(body.result) && body.status !== "1") {
    throw new Error(body.message || "Blockscout request failed");
  }
  const rawLogs = Array.isArray(body.result) ? (body.result as BlockscoutLogEntry[]) : [];

  const genesisTimestamp = getChain(network).genesisTimestamp;
  const events: DecodedAuthorizationEvent[] = [];
  for (const log of rawLogs) {
    if ((log.topics[0] ?? "").toLowerCase() !== topic0.toLowerCase()) continue;
    if ((log.topics[1] ?? "").toLowerCase() !== topic1) continue;

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
