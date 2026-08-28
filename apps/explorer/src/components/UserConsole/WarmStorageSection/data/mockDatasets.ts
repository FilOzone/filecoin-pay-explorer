/**
 * POC-only mock data. The real page derives these rows from indexed contract
 * events (last write from PieceAdded, per-dataset rail spend) — see the epic's
 * activity-signal table. Activity is measured from last write only: retrieval
 * visibility needs FilBeam and is out of scope for this page.
 */

export type MockDataset = {
  id: string;
  name: string;
  rootCid: string;
  sizeGiB: number;
  createdAt: string;
  /** Last piece-added event, from indexed contract events. Always available. */
  lastWriteAt: string;
  burnPerDayUSD: number;
  /** One-time operation fees charged in the last 30 days (e.g. dataset creation, piece adds). */
  oneTimeOpsUSD: number;
  lockedUSD: number;
};

export const MOCK_NOW = new Date("2026-08-27T12:00:00Z");

/**
 * Funds are account-level in Filecoin Pay, shared across services: runway is
 * a property of the account, never of a single dataset.
 */
export const MOCK_ACCOUNT = {
  availableUSD: 450,
};

export const MOCK_DATASETS: MockDataset[] = [
  {
    id: "ds-101",
    name: "production-media",
    rootCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    sizeGiB: 512,
    createdAt: "2026-02-10T00:00:00Z",
    lastWriteAt: "2026-08-25T09:30:00Z",
    burnPerDayUSD: 0.42,
    oneTimeOpsUSD: 4.2,
    lockedUSD: 61.5,
  },
  {
    id: "ds-102",
    name: "site-backups",
    rootCid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    sizeGiB: 1024,
    createdAt: "2026-01-04T00:00:00Z",
    lastWriteAt: "2026-08-26T23:05:00Z",
    burnPerDayUSD: 0.84,
    oneTimeOpsUSD: 2.1,
    lockedUSD: 118.2,
  },
  {
    id: "ds-103",
    name: "event-photos-2025",
    rootCid: "bafybeibxm2nsadl3fnxv2sxcxmxaco2jl53wpeorjdzidjwf5aqdg7wa6u",
    sizeGiB: 340,
    createdAt: "2025-11-20T00:00:00Z",
    lastWriteAt: "2026-01-08T14:00:00Z",
    burnPerDayUSD: 0.28,
    oneTimeOpsUSD: 0,
    lockedUSD: 40.9,
  },
  {
    id: "ds-104",
    name: "ml-training-snapshots",
    rootCid: "bafybeif7ztnhq65lumvvtr4ekcwd2ifwgm3awq4zfr3srh462rwyinlb4y",
    sizeGiB: 2048,
    createdAt: "2025-09-02T00:00:00Z",
    lastWriteAt: "2025-12-15T10:00:00Z",
    burnPerDayUSD: 1.67,
    oneTimeOpsUSD: 0,
    lockedUSD: 241.7,
  },
  {
    id: "ds-105",
    name: "staging-fixtures",
    rootCid: "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354",
    sizeGiB: 96,
    createdAt: "2026-05-11T00:00:00Z",
    lastWriteAt: "2026-05-11T16:20:00Z",
    burnPerDayUSD: 0.08,
    oneTimeOpsUSD: 0,
    lockedUSD: 11.6,
  },
  {
    id: "ds-106",
    name: "podcast-archive",
    rootCid: "bafybeigrf2dwtpjkiovnigysyto3d55opf6qkdikx6d65onrqnfzwgdkfa",
    sizeGiB: 780,
    createdAt: "2026-03-30T00:00:00Z",
    lastWriteAt: "2026-08-14T07:45:00Z",
    burnPerDayUSD: 0.64,
    oneTimeOpsUSD: 1.1,
    lockedUSD: 92.3,
  },
];
