/**
 * POC-only mock data. The real page derives these rows from indexed contract
 * events (last write, proving) and FilBeam (retrieval) — see the epic's
 * activity-signal table. Retrieval is intentionally `undefined` for datasets
 * not served through FilBeam: without FilBeam the signal does not exist, and
 * the UI must say so rather than imply "never accessed".
 */

export type ProvingStatus = "healthy" | "degraded" | "faulted";

export type RetrievalSignal = {
  lastRetrievedAt: string;
  successRate: number;
};

export type MockDataset = {
  id: string;
  name: string;
  rootCid: string;
  sizeGiB: number;
  createdAt: string;
  /** Last piece-added event, from indexed contract events. Always available. */
  lastWriteAt: string;
  fundedUntil: string;
  burnPerDayUSD: number;
  lockedUSD: number;
  provingStatus: ProvingStatus;
  /** Only present when the dataset is served through FilBeam. */
  retrieval?: RetrievalSignal;
};

export const MOCK_NOW = new Date("2026-08-27T12:00:00Z");

export const MOCK_DATASETS: MockDataset[] = [
  {
    id: "ds-101",
    name: "production-media",
    rootCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    sizeGiB: 512,
    createdAt: "2026-02-10T00:00:00Z",
    lastWriteAt: "2026-08-25T09:30:00Z",
    fundedUntil: "2027-01-14T00:00:00Z",
    burnPerDayUSD: 0.42,
    lockedUSD: 61.5,
    provingStatus: "healthy",
    retrieval: { lastRetrievedAt: "2026-08-27T02:11:00Z", successRate: 0.998 },
  },
  {
    id: "ds-102",
    name: "site-backups",
    rootCid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    sizeGiB: 1024,
    createdAt: "2026-01-04T00:00:00Z",
    lastWriteAt: "2026-08-26T23:05:00Z",
    fundedUntil: "2026-09-18T00:00:00Z",
    burnPerDayUSD: 0.84,
    lockedUSD: 118.2,
    provingStatus: "healthy",
  },
  {
    id: "ds-103",
    name: "event-photos-2025",
    rootCid: "bafybeibxm2nsadl3fnxv2sxcxmxaco2jl53wpeorjdzidjwf5aqdg7wa6u",
    sizeGiB: 340,
    createdAt: "2025-11-20T00:00:00Z",
    lastWriteAt: "2026-01-08T14:00:00Z",
    fundedUntil: "2026-11-02T00:00:00Z",
    burnPerDayUSD: 0.28,
    lockedUSD: 40.9,
    provingStatus: "healthy",
    retrieval: { lastRetrievedAt: "2026-02-01T08:40:00Z", successRate: 1 },
  },
  {
    id: "ds-104",
    name: "ml-training-snapshots",
    rootCid: "bafybeif7ztnhq65lumvvtr4ekcwd2ifwgm3awq4zfr3srh462rwyinlb4y",
    sizeGiB: 2048,
    createdAt: "2025-09-02T00:00:00Z",
    lastWriteAt: "2025-12-15T10:00:00Z",
    fundedUntil: "2026-10-06T00:00:00Z",
    burnPerDayUSD: 1.67,
    lockedUSD: 241.7,
    provingStatus: "healthy",
  },
  {
    id: "ds-105",
    name: "staging-fixtures",
    rootCid: "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354",
    sizeGiB: 96,
    createdAt: "2026-05-11T00:00:00Z",
    lastWriteAt: "2026-05-11T16:20:00Z",
    fundedUntil: "2026-09-04T00:00:00Z",
    burnPerDayUSD: 0.08,
    lockedUSD: 11.6,
    provingStatus: "degraded",
  },
  {
    id: "ds-106",
    name: "podcast-archive",
    rootCid: "bafybeigrf2dwtpjkiovnigysyto3d55opf6qkdikx6d65onrqnfzwgdkfa",
    sizeGiB: 780,
    createdAt: "2026-03-30T00:00:00Z",
    lastWriteAt: "2026-08-14T07:45:00Z",
    fundedUntil: "2026-09-09T00:00:00Z",
    burnPerDayUSD: 0.64,
    lockedUSD: 92.3,
    provingStatus: "faulted",
    retrieval: { lastRetrievedAt: "2026-08-26T19:03:00Z", successRate: 0.91 },
  },
];
