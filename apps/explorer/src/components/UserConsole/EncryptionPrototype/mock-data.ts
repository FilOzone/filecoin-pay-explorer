// PROTOTYPE, throwaway. In-memory mock data for the encryption console views.

export type Keyspace = {
  id: string;
  epoch: number;
  commitment: string;
  label: string;
  createdAt: number;
  onChain: { dataSetIds: number[] } | null;
};
export type Role = { keyspaceId: string; path: string; createdAt: number };
export type Grant = {
  keyspaceId: string;
  node: "keyspace" | `role:${string}`;
  recipientAddress: string;
  recipientPublicKey: string;
  /** Local label for a recipient pasted as a bare public key (no known session key). */
  recipientLabel?: string;
  issuedAt: number;
};
export type SessionKey = { address: string; label: string; publicKey: string | null };
export type Seed = { keyspaces: Keyspace[]; roles: Role[]; grants: Grant[]; sessionKeys: SessionKey[] };
export type SeedState = "full" | "empty" | "fresh-browser";

const DAY = 86_400_000;
const ago = (d: number) => Date.now() - d * DAY;

export const shortId = (id: string) => `ks_${id.slice(0, 4)}…`;
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const ksName = (k: Keyspace) => k.label || shortId(k.id);
export const fakeId = () => Math.random().toString(16).slice(2, 10);
export const fakeBlob = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from({ length: 220 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const ADDR = {
  bot: "0x9a1c3e5f7b2d4a6c8e0f1a3b5c7d9e1f2a4b6c8d",
  laptop: "0x1f2e3d4c5b6a79881706f5e4d3c2b1a09f8e7d6c",
  ci: "0x7c6b5a49382716059483726150493827160594af",
  backup: "0xaa11bb22cc33dd44ee55ff6600778899aabbccdd",
  old: "0x3d3c3b3a39383736353433323130292827262524",
};
const pk = (s: string) =>
  `0x04${Array.from(s)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("")
    .padEnd(128, "a")
    .slice(0, 128)}`;

const chainKeyspaces: Keyspace[] = [
  {
    id: "1a2b3c4d5e6f7a8b",
    epoch: 1,
    commitment: "0x9f3a…c21e",
    label: "",
    createdAt: ago(40),
    onChain: { dataSetIds: [412] },
  },
  {
    id: "7e8f9a0b1c2d3e4f",
    epoch: 2,
    commitment: "0x41bd…07aa",
    label: "",
    createdAt: ago(90),
    onChain: { dataSetIds: [101, 233] },
  },
];

const sessionKeysWithPk: SessionKey[] = [
  { address: ADDR.bot, label: "build-bot", publicKey: pk("bot") },
  { address: ADDR.laptop, label: "my-laptop", publicKey: pk("laptop") },
  { address: ADDR.backup, label: "backup-service", publicKey: pk("backup") },
  { address: ADDR.ci, label: "ci-runner", publicKey: pk("ci") },
  { address: ADDR.old, label: "old-runner", publicKey: null },
];

export function seedFor(state: SeedState): Seed {
  if (state === "empty") return { keyspaces: [], roles: [], grants: [], sessionKeys: sessionKeysWithPk };
  if (state === "fresh-browser") {
    return {
      keyspaces: chainKeyspaces,
      roles: [],
      grants: [],
      sessionKeys: sessionKeysWithPk.map((s) => ({ ...s, label: "", publicKey: null })),
    };
  }
  const d = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);
  const R = "a0b1c2d3e4f50617";
  const P = "f1e2d3c4b5a69788";
  const W = "c3d4e5f607182930";
  const sk = (a: string) => sessionKeysWithPk.find((x) => x.address === a)?.publicKey ?? "";
  const g = (keyspaceId: string, path: string | null, addr: string, issuedAt: number): Grant => ({
    keyspaceId,
    node: path ? `role:${path}` : "keyspace",
    recipientAddress: addr,
    recipientPublicKey: sk(addr),
    issuedAt,
  });
  return {
    keyspaces: [
      {
        id: R,
        epoch: 3,
        commitment: "0xc0de…beef",
        label: "Research",
        createdAt: d(2026, 5, 1),
        onChain: { dataSetIds: [57, 58, 61] },
      },
      {
        id: P,
        epoch: 1,
        commitment: "0x2468…ace0",
        label: "Personal backup",
        createdAt: d(2026, 8, 12),
        onChain: { dataSetIds: [88] },
      },
      { id: W, epoch: 1, commitment: "0x7a7a…1b1b", label: "Work", createdAt: d(2026, 10, 1), onChain: null },
      chainKeyspaces[0] as Keyspace,
      {
        id: "d1d2d3d4d5d6d7d8",
        epoch: 1,
        commitment: "0x1111…2222",
        label: "Legal",
        createdAt: d(2026, 6, 3),
        onChain: { dataSetIds: [301, 302] },
      },
      {
        id: "e1e2e3e4e5e6e7e8",
        epoch: 2,
        commitment: "0x3333…4444",
        label: "Finance",
        createdAt: d(2026, 7, 9),
        onChain: { dataSetIds: [415] },
      },
      {
        id: "9a8b7c6d5e4f3a2b",
        epoch: 1,
        commitment: "0x5555…6666",
        label: "",
        createdAt: d(2026, 8, 20),
        onChain: { dataSetIds: [520, 521, 522] },
      },
      {
        id: "b1b2b3b4b5b6b7b8",
        epoch: 1,
        commitment: "0x7777…8888",
        label: "Archive 2025",
        createdAt: d(2026, 9, 5),
        onChain: null,
      },
    ],
    roles: [
      { keyspaceId: "d1d2d3d4d5d6d7d8", path: "contracts", createdAt: d(2026, 6, 4) },
      { keyspaceId: "d1d2d3d4d5d6d7d8", path: "contracts/nda", createdAt: d(2026, 6, 5) },
      { keyspaceId: "e1e2e3e4e5e6e7e8", path: "invoices", createdAt: d(2026, 7, 10) },
      { keyspaceId: "e1e2e3e4e5e6e7e8", path: "payroll", createdAt: d(2026, 7, 11) },
      { keyspaceId: "9a8b7c6d5e4f3a2b", path: "scratch", createdAt: d(2026, 8, 21) },
      { keyspaceId: "b1b2b3b4b5b6b7b8", path: "2025/q4", createdAt: d(2026, 9, 6) },
      ...[
        "research",
        "research/datasets",
        "research/datasets/papers",
        "research/datasets/papers/drafts",
        "research/experiments",
      ].map((path, i) => ({ keyspaceId: R, path, createdAt: d(2026, 5, 2 + i) })),
      { keyspaceId: P, path: "photos", createdAt: d(2026, 8, 13) },
      { keyspaceId: P, path: "documents", createdAt: d(2026, 8, 14) },
      { keyspaceId: W, path: "reports", createdAt: d(2026, 10, 2) },
    ],
    grants: [
      g(R, "research", ADDR.laptop, d(2026, 6, 24)),
      g(R, "research/datasets/papers", ADDR.bot, d(2026, 9, 22)),
      g(R, "research/experiments", ADDR.ci, d(2026, 10, 3)),
      g(R, "research/datasets", ADDR.bot, d(2026, 10, 7)),
      g(P, "photos", ADDR.backup, d(2026, 10, 10)),
      {
        keyspaceId: R,
        node: "role:research/datasets/papers/drafts",
        recipientAddress: "",
        recipientPublicKey: `0x04${"ab12".repeat(32)}`,
        issuedAt: d(2026, 10, 11),
      },
    ],
    sessionKeys: sessionKeysWithPk,
  };
}
