import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { formatUnits } from "viem";
import { z } from "zod";

/** Matches STALE_AFTER_DAYS in the explorer's triage queue (StaleQueue/data/staleness.ts). */
export const STALE_AFTER_DAYS = 30;

const SECONDS_PER_DAY = 86_400;
/** graph-node's per-request maximum. */
const PAGE_SIZE = 1_000;
/** Up to 10,000 stale datasets, the same limit as the explorer's queue. */
const MAX_PAGES = 10;
const SUBGRAPH_TIMEOUT_MS = 10_000;

const STALE_DATA_SETS_QUERY = `
  query StaleDataSets($payer: Bytes!, $before: BigInt!, $cursor: Bytes!, $first: Int!) {
    _meta { block { number } }
    dataSets(
      where: { payer: $payer, lastWriteAt_lt: $before, status_in: [ACTIVE, CDN_TERMINATED], id_gt: $cursor }
      first: $first
      orderBy: id
      orderDirection: asc
    ) {
      id
      dataSetId
      lastWriteAt
      pdpRail { paymentRate state endEpoch token { symbol decimals } }
      cacheMissRail { paymentRate state endEpoch }
      cdnRail { paymentRate state endEpoch }
    }
  }
`;

// Subgraph BigInt values arrive as decimal strings.
const railSchema = z.object({ paymentRate: z.string(), state: z.string(), endEpoch: z.string() });

const staleDataSetSchema = z.object({
  id: z.string(),
  dataSetId: z.string(),
  lastWriteAt: z.string(),
  pdpRail: railSchema.extend({ token: z.object({ symbol: z.string(), decimals: z.string() }) }),
  cacheMissRail: railSchema.nullable(),
  cdnRail: railSchema.nullable(),
});

const pageSchema = z.object({
  data: z.object({
    _meta: z.object({ block: z.object({ number: z.number() }) }),
    dataSets: z.array(staleDataSetSchema),
  }),
});

export type StaleDataSet = z.infer<typeof staleDataSetSchema>;
type Rail = z.infer<typeof railSchema>;

export type StaleDataSets = {
  /** Subgraph head block, standing in for the current epoch. */
  epoch: bigint;
  dataSets: StaleDataSet[];
};

/** Every dataset of `payer` with no write in STALE_AFTER_DAYS, walked by id cursor. */
export async function fetchStaleDataSets(subgraphUrl: string, payer: string, nowSec: number): Promise<StaleDataSets> {
  const before = String(nowSec - STALE_AFTER_DAYS * SECONDS_PER_DAY);
  const dataSets: StaleDataSet[] = [];
  let epoch = 0n;
  let cursor = "0x";

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: STALE_DATA_SETS_QUERY,
        variables: { payer, before, cursor, first: PAGE_SIZE },
      }),
      signal: AbortSignal.timeout(SUBGRAPH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Subgraph responded ${res.status}`);

    // A GraphQL error comes back as 200 without `data`, which the schema rejects.
    const { data } = pageSchema.parse(await res.json());
    epoch = BigInt(data._meta.block.number);
    dataSets.push(...data.dataSets);
    if (data.dataSets.length < PAGE_SIZE) break;

    const nextCursor = data.dataSets.at(-1)?.id;
    if (!nextCursor || nextCursor === cursor) throw new Error("Subgraph pagination did not advance");
    cursor = nextCursor;
  }

  return { epoch, dataSets };
}

// Mirrors the explorer's monthlyDataSetSpend: a terminated rail keeps charging until its end epoch.
function monthlyRailSpend(rail: Rail | null, epoch: bigint): bigint {
  if (!rail || rail.state === "FINALIZED") return 0n;

  if (rail.state !== "TERMINATED") return BigInt(rail.paymentRate) * TIME_CONSTANTS.EPOCHS_PER_MONTH;

  const remaining = BigInt(rail.endEpoch) - epoch;
  if (remaining <= 0n) return 0n;
  const chargingEpochs = remaining < TIME_CONSTANTS.EPOCHS_PER_MONTH ? remaining : TIME_CONSTANTS.EPOCHS_PER_MONTH;
  return BigInt(rail.paymentRate) * chargingEpochs;
}

export type DataSetMute = { dataSetId: string; mutedUntil: number };
export type SentInactivityAlert = { dataSetId: string; lastWriteAt: number; sentAt: number };

export type InactiveDataSet = {
  dataSetId: string;
  lastWriteAt: number;
  daysInactive: number;
  monthlySpend: bigint;
  token: { symbol: string; decimals: number };
};

/**
 * The stale datasets to email about now, highest monthly spend × days inactive
 * first. A dataset is emailed once per inactive period: again only after a new
 * write (a new `lastWriteAt`) or once a snooze that ended after the last email
 * has passed.
 */
export function selectDataSetsToEmail(
  stale: StaleDataSets,
  mutes: DataSetMute[],
  sent: SentInactivityAlert[],
  nowSec: number,
): InactiveDataSet[] {
  const muteById = new Map(mutes.map((mute) => [mute.dataSetId, mute]));
  const sentById = new Map(sent.map((alert) => [alert.dataSetId, alert]));

  const selected: InactiveDataSet[] = [];
  for (const dataSet of stale.dataSets) {
    const mute = muteById.get(dataSet.dataSetId);
    if (mute && mute.mutedUntil > nowSec) continue;

    const lastWriteAt = Number(dataSet.lastWriteAt);
    const previous = sentById.get(dataSet.dataSetId);
    const isNewPeriod = !previous || previous.lastWriteAt !== lastWriteAt;
    const snoozeEndedSinceEmail = previous !== undefined && mute !== undefined && mute.mutedUntil > previous.sentAt;
    if (!isNewPeriod && !snoozeEndedSinceEmail) continue;

    selected.push({
      dataSetId: dataSet.dataSetId,
      lastWriteAt,
      daysInactive: Math.floor((nowSec - lastWriteAt) / SECONDS_PER_DAY),
      monthlySpend:
        monthlyRailSpend(dataSet.pdpRail, stale.epoch) +
        monthlyRailSpend(dataSet.cacheMissRail, stale.epoch) +
        monthlyRailSpend(dataSet.cdnRail, stale.epoch),
      token: { symbol: dataSet.pdpRail.token.symbol, decimals: Number(dataSet.pdpRail.token.decimals) },
    });
  }

  const weight = (dataSet: InactiveDataSet) => dataSet.monthlySpend * BigInt(dataSet.daysInactive);
  return selected.sort((a, b) => {
    const difference = weight(b) - weight(a);
    if (difference === 0n) return 0;
    return difference > 0n ? 1 : -1;
  });
}

/** e.g. "1.25 USDFC". */
export function formatMonthlySpend(dataSet: InactiveDataSet): string {
  const amount = Number(formatUnits(dataSet.monthlySpend, dataSet.token.decimals));
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${dataSet.token.symbol}`;
}
