import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStaleDataSets,
  formatMonthlySpend,
  type StaleDataSet,
  type StaleDataSets,
  selectDataSetsToEmail,
} from "../../alert-processor/inactivity";

const NOW = Math.floor(new Date("2026-09-24T00:00:00Z").getTime() / 1000);
const DAY = 86_400;
const EPOCH = 1_000_000n;
const MONTH = TIME_CONSTANTS.EPOCHS_PER_MONTH;

const rail = (paymentRate: string, state = "ACTIVE", endEpoch = "0") => ({ paymentRate, state, endEpoch });

function dataSet(dataSetId: string, daysInactive: number, paymentRate = "1"): StaleDataSet {
  return {
    id: `0x${dataSetId.padStart(4, "0")}`,
    dataSetId,
    lastWriteAt: String(NOW - daysInactive * DAY),
    pdpRail: { ...rail(paymentRate), token: { symbol: "USDFC", decimals: "18" } },
    cacheMissRail: null,
    cdnRail: null,
  };
}

const stale = (...dataSets: StaleDataSet[]): StaleDataSets => ({ epoch: EPOCH, dataSets });
const lastWriteAt = (days: number) => NOW - days * DAY;
const ids = (selected: { dataSetId: string }[]) => selected.map((entry) => entry.dataSetId);

describe("selectDataSetsToEmail", () => {
  it("emails a dataset that was never emailed about", () => {
    expect(ids(selectDataSetsToEmail(stale(dataSet("1", 31)), [], [], NOW))).toEqual(["1"]);
  });

  it("emails once per inactive period, and again after a new write", () => {
    const sent = [{ dataSetId: "1", lastWriteAt: lastWriteAt(40), sentAt: NOW - 5 * DAY }];

    expect(selectDataSetsToEmail(stale(dataSet("1", 40)), [], sent, NOW)).toEqual([]);
    expect(ids(selectDataSetsToEmail(stale(dataSet("1", 31)), [], sent, NOW))).toEqual(["1"]);
  });

  it("skips a snoozed dataset until the snooze ends", () => {
    const mutes = [{ dataSetId: "1", mutedUntil: NOW + DAY }];

    expect(selectDataSetsToEmail(stale(dataSet("1", 31)), mutes, [], NOW)).toEqual([]);
  });

  it("emails again when a snooze ended after the last email, but not for an older snooze", () => {
    const sent = [{ dataSetId: "1", lastWriteAt: lastWriteAt(100), sentAt: NOW - 60 * DAY }];

    const endedAfterEmail = [{ dataSetId: "1", mutedUntil: NOW - DAY }];
    expect(ids(selectDataSetsToEmail(stale(dataSet("1", 100)), endedAfterEmail, sent, NOW))).toEqual(["1"]);

    const endedBeforeEmail = [{ dataSetId: "1", mutedUntil: NOW - 70 * DAY }];
    expect(selectDataSetsToEmail(stale(dataSet("1", 100)), endedBeforeEmail, sent, NOW)).toEqual([]);
  });

  it("ranks by monthly spend × days inactive, the same as the triage queue", () => {
    const selected = selectDataSetsToEmail(
      stale(dataSet("1", 100, "1"), dataSet("2", 30, "20"), dataSet("3", 40, "10")),
      [],
      [],
      NOW,
    );

    expect(ids(selected)).toEqual(["2", "3", "1"]);
    expect(selected[0]).toEqual({
      dataSetId: "2",
      lastWriteAt: lastWriteAt(30),
      daysInactive: 30,
      monthlySpend: 20n * MONTH,
      token: { symbol: "USDFC", decimals: 18 },
    });
  });

  it("counts a terminated CDN rail only until its end epoch", () => {
    const withCdn = {
      ...dataSet("1", 31, "10"),
      cdnRail: rail("5", "TERMINATED", String(EPOCH + 100n)),
      cacheMissRail: rail("5", "TERMINATED", String(EPOCH - 1n)),
    };

    const selected = selectDataSetsToEmail(stale(withCdn), [], [], NOW);
    expect(selected[0]?.monthlySpend).toBe(10n * MONTH + 5n * 100n);
  });
});

describe("formatMonthlySpend", () => {
  it("formats the token amount with at most four decimals", () => {
    const inactive = {
      dataSetId: "1",
      lastWriteAt: lastWriteAt(31),
      daysInactive: 31,
      monthlySpend: 1_234_567_000_000_000_000n,
      token: { symbol: "USDFC", decimals: 18 },
    };
    expect(formatMonthlySpend(inactive)).toBe("1.2346 USDFC");
  });
});

describe("fetchStaleDataSets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const page = (rows: StaleDataSet[]) =>
    new Response(JSON.stringify({ data: { _meta: { block: { number: 1_000_000 } }, dataSets: rows } }));

  it("walks cursor pages until a short one", async () => {
    const fullPage = Array.from({ length: 1_000 }, (_, i) => dataSet(String(i + 1), 31));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(fullPage))
      .mockResolvedValueOnce(page([dataSet("1001", 31)]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchStaleDataSets("https://subgraph.test", "0xabc", NOW);

    expect(result.epoch).toBe(EPOCH);
    expect(result.dataSets).toHaveLength(1_001);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
    expect(secondRequest.variables).toEqual({
      payer: "0xabc",
      before: String(NOW - 30 * DAY),
      cursor: fullPage.at(-1)?.id,
      first: 1_000,
    });
  });

  it("throws on a GraphQL error so the message is retried", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "boom" }] }))));

    await expect(fetchStaleDataSets("https://subgraph.test", "0xabc", NOW)).rejects.toThrow();
  });
});
