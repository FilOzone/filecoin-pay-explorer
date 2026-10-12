"use client";
// PROTOTYPE, throwaway. Variant D: keyspace cards with role tree + selected-node detail panel + all-grants ledger.
import { Button } from "@filecoin-pay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Input } from "@filecoin-pay/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@filecoin-pay/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import {
  CaretDownIcon,
  CaretRightIcon,
  InfoIcon,
  KeyIcon,
  LockIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { GrantDialog } from "./GrantDialog";
import {
  BrowserOnlyNotice,
  dataText,
  grantRecipient,
  NO_REVOKE,
  type Scope,
  type Store,
  shortKey,
  useStore,
} from "./grant-shared";
import { fakeId, type Grant, type Keyspace, type SeedState, shortAddr, shortId } from "./mock-data";

type Sel = { ks: string; node: string }; // node: "keyspace" or a role path

const segs = (p: string) => p.split("/");
const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const card = "rounded-xl border bg-card p-5";
const grantKey = (g: Grant) => g.recipientAddress + g.recipientPublicKey + g.node + g.issuedAt + g.keyspaceId;
const grantPath = (g: Grant) => (g.node === "keyspace" ? null : g.node.slice(5));

const mono = "flex items-center gap-1 whitespace-nowrap font-mono text-xs text-muted-foreground";

function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className='max-w-64'>{text}</TooltipContent>
    </Tooltip>
  );
}

function HeadInfo({ label, tip, className }: { label: string; tip: string; className?: string }) {
  return (
    <th className={`py-2 font-medium ${className ?? ""}`}>
      <span className='inline-flex items-center gap-1'>
        {label}
        <Tip text={tip}>
          <InfoIcon className='size-3.5' />
        </Tip>
      </span>
    </th>
  );
}

/** Alias / Address / Recipient key header cells (fixed widths; the table is `table-fixed`). */
function RecipientHeads() {
  return (
    <>
      <HeadInfo className='w-40' label='Alias' tip='Local name, this browser only.' />
      <HeadInfo
        className='w-36'
        label='Address'
        tip="The session key's address, from its signing key. Used for its on-chain authorization. Unknown when the grant went to a pasted recipient key."
      />
      <HeadInfo
        className='w-36'
        label='Recipient key'
        tip="The key the grant is encrypted to. Derived from the session key's private key, so it can't be computed from the address."
      />
    </>
  );
}

/** Alias / Address / Recipient key body cells. */
function RecipientCells({ store, g, onRename }: { store: Store; g: Grant; onRename: (key: string) => void }) {
  const r = grantRecipient(store.sessionKeys, g, store.aliases);
  return (
    <>
      <td className='py-3 pr-3'>
        <span className='flex min-w-0 items-center gap-1.5 font-semibold'>
          <KeyIcon className='shrink-0 text-muted-foreground' />
          <span className='truncate' title={r.alias}>
            {r.alias}
          </span>
          <button type='button' className='shrink-0' aria-label='Rename recipient' onClick={() => onRename(r.key)}>
            <PencilSimpleIcon className='size-3.5 text-muted-foreground hover:text-foreground' />
          </button>
        </span>
      </td>
      <td className='pr-3'>
        {r.address ? (
          <span className={mono}>
            {shortAddr(r.address)}
            <CopyButton value={r.address} />
          </span>
        ) : (
          <Tip text='This grant was issued to a pasted recipient key with no address.'>
            <span className='text-xs text-muted-foreground'>Unknown</span>
          </Tip>
        )}
      </td>
      <td className='pr-3'>
        <span className={mono}>
          {shortKey(r.key)}
          <CopyButton value={r.key} />
        </span>
      </td>
    </>
  );
}

function AliasDialog({ store, keyId, onClose }: { store: Store; keyId: string; onClose: () => void }) {
  const [v, setV] = useState(store.aliases[keyId] ?? "");
  return (
    <div className='space-y-3'>
      <Input placeholder='Alias' value={v} onChange={(e) => setV(e.target.value)} />
      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            store.setAlias(keyId, v.trim());
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function KeyspaceDialog({
  mode,
  ks,
  store,
  onDone,
  onClose,
}: {
  mode: "new" | "rename";
  ks?: Keyspace;
  store: Store;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(ks?.label ?? "");
  const [signed, setSigned] = useState(false);
  const isNew = mode === "new";
  const ok = label.trim() && (!isNew || signed);
  return (
    <div className='space-y-3'>
      <Input placeholder='Label, e.g. Research' value={label} onChange={(e) => setLabel(e.target.value)} />
      {isNew ? (
        <Button variant={signed ? "secondary" : "default"} disabled={signed} onClick={() => setSigned(true)}>
          {signed ? "Signed" : "Sign with your wallet (one signature)"}
        </Button>
      ) : (
        <p className='text-xs text-muted-foreground'>Renaming only changes the label in this browser.</p>
      )}
      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!ok}
          onClick={() => {
            if (isNew) {
              const id = fakeId() + fakeId();
              store.addKeyspace({
                id,
                epoch: 1,
                commitment: `0x${fakeId().slice(0, 4)}…${fakeId().slice(0, 4)}`,
                label: label.trim(),
                createdAt: Date.now(),
                onChain: null,
              });
              onDone(id);
            } else if (ks) {
              store.rename(ks.id, label.trim());
            }
            onClose();
          }}
        >
          {isNew ? "Create keyspace" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/** Every record path plus its ancestors; ancestors that aren't records are "virtual". */
function treeNodes(store: Store, ksId: string, closed: Set<string>) {
  const records = new Set(store.roles.filter((r) => r.keyspaceId === ksId).map((r) => r.path));
  const all = new Set<string>();
  for (const p of records) {
    const s = segs(p);
    for (let i = 1; i <= s.length; i++) all.add(s.slice(0, i).join("/"));
  }
  const paths = [...all].sort();
  return paths
    .filter(
      (p) =>
        !segs(p)
          .slice(0, -1)
          .some((_, i) =>
            closed.has(
              `${ksId}:${segs(p)
                .slice(0, i + 1)
                .join("/")}`,
            ),
          ),
    )
    .map((path) => ({
      path,
      depth: segs(path).length - 1,
      virtual: !records.has(path),
      hasChildren: paths.some((o) => o.startsWith(`${path}/`)),
    }));
}

export default function VariantD({ state }: { state: SeedState }) {
  const store = useStore(state);
  const first = store.keyspaces[0];
  const [sel, setSel] = useState<Sel | null>(first ? { ks: first.id, node: "keyspace" } : null);
  const [open, setOpen] = useState<Record<string, boolean>>(first ? { [first.id]: true } : {});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [grantDlg, setGrantDlg] = useState<Scope | null>(null);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [ksDialog, setKsDialog] = useState<"new" | "rename" | null>(null);
  const [q, setQ] = useState("");

  const select = (ks: string, node: string) => {
    setSel({ ks, node });
    setOpen((o) => ({ ...o, [ks]: true }));
  };
  const direct = (ks: string, node: string) =>
    store.grants.filter((g) => g.keyspaceId === ks && g.node === (node === "keyspace" ? "keyspace" : `role:${node}`))
      .length;
  const scopeFor = (ks: string, node: string): Scope => ({
    keyspaceId: ks,
    roleOrKeyspace: node === "keyspace" ? "keyspace" : `role:${node}`,
  });

  const selKs = store.keyspaces.find((k) => k.id === sel?.ks);
  const node = sel?.node ?? "keyspace";
  type Reach = { g: Grant; badge: string; from?: string };
  const reaching = (sel ? store.grants.filter((g) => g.keyspaceId === sel.ks) : []).flatMap((g): Reach[] => {
    if (g.node === "keyspace") return [{ g, badge: "Whole keyspace" }];
    if (node === "keyspace") return [];
    const p = g.node.slice(5);
    if (p === node) return [{ g, badge: "Direct" }];
    if (node.startsWith(`${p}/`)) return [{ g, badge: "Inherited", from: p }];
    return [];
  });
  const badgeCls: Record<string, string> = {
    Direct: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
    Inherited: "bg-muted text-muted-foreground",
    "Whole keyspace": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  };

  const ledger = store.grants.filter((g) => {
    const ks = store.keyspaces.find((k) => k.id === g.keyspaceId);
    const hay = [
      grantRecipient(store.sessionKeys, g, store.aliases).alias,
      grantRecipient(store.sessionKeys, g, store.aliases).address,
      g.recipientPublicKey,
      ks?.label,
      ks && shortId(ks.id),
      grantPath(g),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const grantBtn = (label: string, scope: Scope, variant: "default" | "outline" = "default") => (
    <Button variant={variant} onClick={() => setGrantDlg(scope)}>
      {label}
    </Button>
  );

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-semibold'>Encryption access</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Manage keyspace keys, organize roles, and control who can access your encrypted data.
          </p>
        </div>
        <div className='flex gap-2'>{grantBtn("New grant…", {}, "outline")}</div>
      </div>

      {store.keyspaces.length === 0 ? (
        <div className='rounded-xl border border-dashed p-12 text-center'>
          <LockIcon className='mx-auto size-8 text-muted-foreground' />
          <p className='mt-2 font-medium'>No keyspaces yet</p>
          <p className='mb-4 text-sm text-muted-foreground'>
            Give a session key access to encrypted data to get started.
          </p>
          {grantBtn("New grant…", {})}
        </div>
      ) : (
        <div className='grid items-start gap-6 lg:grid-cols-5'>
          <div className={`${card} space-y-4 overflow-hidden lg:col-span-2`}>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <h2 className='text-lg font-semibold'>Keyspaces</h2>
                <p className='text-sm text-muted-foreground'>
                  Each keyspace is opened by one wallet signature. Data sets can be tagged with one, but it can encrypt
                  pieces in any data set.
                </p>
              </div>
              <Button
                size='icon-sm'
                className='shrink-0'
                aria-label='New keyspace'
                title='New keyspace'
                onClick={() => setKsDialog("new")}
              >
                <PlusIcon />
              </Button>
            </div>
            <ul className='-mx-5 -mb-5 max-h-[480px] divide-y overflow-y-auto border-t'>
              {store.keyspaces.map((k) => {
                const isOpen = open[k.id];
                const roles = store.roles.filter((r) => r.keyspaceId === k.id).length;
                const grants = store.grants.filter((g) => g.keyspaceId === k.id).length;
                const selected = sel?.ks === k.id && sel.node === "keyspace";
                const nodes = treeNodes(store, k.id, closed);
                const active = sel?.ks === k.id;
                return (
                  <li key={k.id} className={active ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}>
                    <div
                      className={`flex h-14 items-center gap-2 px-5 ${selected ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
                    >
                      <LockIcon className='size-4 shrink-0 text-muted-foreground' />
                      <div className='flex min-w-0 flex-1 flex-col justify-center overflow-hidden whitespace-nowrap'>
                        <div className='flex items-baseline gap-2'>
                          <button
                            type='button'
                            className={`min-w-0 truncate text-left text-sm ${k.label ? "font-semibold" : "italic text-muted-foreground"}`}
                            onClick={() => {
                              select(k.id, "keyspace");
                              setOpen((o) => ({ ...o, [k.id]: !o[k.id] }));
                            }}
                          >
                            {k.label || "Unlabeled keyspace"}
                          </button>
                          {!k.label && (
                            <button
                              type='button'
                              className='shrink-0 text-xs underline'
                              onClick={() => {
                                select(k.id, "keyspace");
                                setKsDialog("rename");
                              }}
                            >
                              Rename
                            </button>
                          )}
                        </div>
                        <span className='flex items-center gap-1 font-mono text-xs text-muted-foreground'>
                          <span className='truncate'>{shortId(k.id)}</span>
                          <CopyButton value={`ks_${k.id}`} />
                        </span>
                      </div>
                      <span className='shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground'>
                        {roles} roles · {grants} grants · {dataText(k)}
                      </span>
                      <button
                        type='button'
                        aria-label='Expand'
                        className='text-muted-foreground'
                        onClick={() => setOpen((o) => ({ ...o, [k.id]: !o[k.id] }))}
                      >
                        {isOpen ? <CaretDownIcon /> : <CaretRightIcon />}
                      </button>
                    </div>
                    {isOpen && (
                      <div className='pb-2 pl-9 pr-5'>
                        {nodes.length === 0 && (
                          <p className='px-3 py-1 text-xs text-muted-foreground'>No roles recorded in this browser.</p>
                        )}
                        {nodes.map((n) => {
                          const isSel = sel?.ks === k.id && sel.node === n.path;
                          const ckey = `${k.id}:${n.path}`;
                          return (
                            <div
                              key={n.path}
                              className={`relative flex h-7 items-center gap-1 rounded-md pr-2 ${isSel ? "bg-blue-100 dark:bg-blue-900/50" : "hover:bg-accent/50"}`}
                              style={{ paddingLeft: 8 + n.depth * 16 }}
                            >
                              {Array.from({ length: n.depth }, (_, i) => (
                                <span key={i} className='absolute inset-y-0 border-l' style={{ left: 16 + i * 16 }} />
                              ))}
                              {n.hasChildren ? (
                                <button
                                  type='button'
                                  aria-label='Toggle'
                                  className='relative z-10 w-4 shrink-0'
                                  onClick={() =>
                                    setClosed((c) => {
                                      const x = new Set(c);
                                      x.has(ckey) ? x.delete(ckey) : x.add(ckey);
                                      return x;
                                    })
                                  }
                                >
                                  {closed.has(ckey) ? <CaretRightIcon /> : <CaretDownIcon />}
                                </button>
                              ) : (
                                <span className='w-4 shrink-0' />
                              )}
                              <button
                                type='button'
                                onClick={() => select(k.id, n.path)}
                                className={`flex h-full flex-1 items-center justify-between gap-2 text-left text-sm ${n.virtual ? "text-muted-foreground" : ""}`}
                              >
                                <span className='font-mono'>{segs(n.path).at(-1)}</span>
                                <span className='text-xs tabular-nums text-muted-foreground'>
                                  {direct(k.id, n.path)}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <section className={`${card} space-y-4 lg:col-span-3`}>
            {sel && selKs ? (
              <>
                <h2 className='text-lg font-semibold'>Role tree</h2>
                <nav className='flex flex-wrap items-center gap-1 text-sm text-muted-foreground'>
                  <button type='button' className='hover:text-foreground' onClick={() => select(sel.ks, "keyspace")}>
                    {selKs.label || shortId(selKs.id)}
                  </button>
                  {node !== "keyspace" &&
                    segs(node).map((s, i) => (
                      <span
                        key={segs(node)
                          .slice(0, i + 1)
                          .join("/")}
                        className='flex items-center gap-1'
                      >
                        <CaretRightIcon className='size-3' />
                        <button
                          type='button'
                          className='hover:text-foreground'
                          onClick={() =>
                            select(
                              sel.ks,
                              segs(node)
                                .slice(0, i + 1)
                                .join("/"),
                            )
                          }
                        >
                          {s}
                        </button>
                      </span>
                    ))}
                </nav>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <h2 className='text-2xl font-semibold'>
                      {node === "keyspace" ? selKs.label || shortId(selKs.id) : segs(node).at(-1)}
                      {node === "keyspace" && (
                        <button
                          type='button'
                          className='ml-3 align-middle text-sm font-normal text-muted-foreground underline'
                          onClick={() => setKsDialog("rename")}
                        >
                          Rename
                        </button>
                      )}
                    </h2>
                    <p className='text-sm text-muted-foreground'>
                      {node === "keyspace"
                        ? "Keyspace grants include every role."
                        : "Grants to this role include all its child roles."}
                    </p>
                  </div>
                  <div className='flex items-center gap-1'>{grantBtn("Grant access…", scopeFor(sel.ks, node))}</div>
                </div>

                <Tabs defaultValue='access'>
                  <TabsList>
                    <TabsTrigger value='access'>Access ({reaching.length})</TabsTrigger>
                    <TabsTrigger value='details'>Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value='access' className='mt-3 space-y-3'>
                    {reaching.length === 0 ? (
                      <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                        <p className='mb-3'>No grants reach this {node === "keyspace" ? "keyspace" : "role"}.</p>
                        {grantBtn("Grant access…", scopeFor(sel.ks, node), "outline")}
                      </div>
                    ) : (
                      <div className='overflow-x-auto'>
                        <table className='w-full min-w-[40rem] table-fixed text-sm'>
                          <thead>
                            <tr className='border-b text-left text-xs text-muted-foreground'>
                              <RecipientHeads />
                              <HeadInfo
                                className='w-32'
                                label='Type'
                                tip='Direct: granted on this role. Inherited: granted on a role above it. Whole keyspace: a keyspace grant.'
                              />
                              <th className='w-28 font-medium'>Granted on</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reaching.map(({ g, badge, from }) => (
                              <tr key={grantKey(g)} className='border-b last:border-0'>
                                <RecipientCells store={store} g={g} onRename={setRenameKey} />
                                <td>
                                  <span
                                    title={from ? `Inherited from ${from}` : undefined}
                                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeCls[badge]}`}
                                  >
                                    {badge}
                                  </span>
                                </td>
                                <td className='text-muted-foreground'>{fmt(g.issuedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className='flex gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200'>
                      <InfoIcon className='mt-0.5 size-4 shrink-0' />
                      <div>
                        <p>
                          {node === "keyspace"
                            ? "Access to the whole keyspace includes every role."
                            : "Access to this role includes all child roles."}
                        </p>
                        <p className='font-mono text-xs opacity-70'>{node === "keyspace" ? shortId(selKs.id) : node}</p>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value='details' className='mt-3 space-y-3'>
                    <dl className='grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm'>
                      {(
                        [
                          node !== "keyspace" && [
                            "Role path",
                            <span key='p' className='font-mono'>
                              {node}
                            </span>,
                          ],
                          ["Keyspace", selKs.label || "Unlabeled keyspace"],
                          [
                            "Keyspace id",
                            <span key='v' className='inline-flex items-center gap-1 font-mono'>
                              {shortId(selKs.id)}
                              <CopyButton value={`ks_${selKs.id}`} />
                            </span>,
                          ],
                          ["Epoch", selKs.epoch],
                          [
                            "Commitment",
                            <span key='v' className='inline-flex items-center gap-1 font-mono'>
                              {selKs.commitment}
                              <CopyButton value={selKs.commitment} />
                            </span>,
                          ],
                          [
                            "Created",
                            fmt(
                              node === "keyspace"
                                ? selKs.createdAt
                                : (store.roles.find((r) => r.keyspaceId === sel.ks && r.path === node)?.createdAt ??
                                    selKs.createdAt),
                            ),
                          ],
                        ] as ([string, ReactNode] | false)[]
                      ).map((row) =>
                        row ? (
                          <div key={row[0]} className='contents'>
                            <dt className='text-muted-foreground'>{row[0]}</dt>
                            <dd>{row[1]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                    <div className='space-y-1.5 text-sm'>
                      <p className='text-muted-foreground'>Data sets tagged with this keyspace:</p>
                      {selKs.onChain ? (
                        <div className='flex flex-wrap gap-1.5'>
                          {selKs.onChain.dataSetIds.map((id) => (
                            <span key={id} className='rounded-md bg-muted px-2 py-0.5 font-mono text-xs'>
                              #{id}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>No data yet</p>
                      )}
                      <p className='text-xs text-muted-foreground'>
                        Pieces encrypted under this keyspace can also sit in other data sets.
                      </p>
                    </div>
                    <Notice tone='info'>Role names are public: they're stored in clear in every encrypted file.</Notice>
                  </TabsContent>
                </Tabs>
              </>
            ) : null}
          </section>
        </div>
      )}

      <section className={`${card} space-y-4`}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold'>All grants</h2>
            <p className='text-sm text-muted-foreground'>
              All access grants across all keyspaces and roles. {NO_REVOKE}
            </p>
          </div>
          <div className='relative w-full sm:w-80'>
            <MagnifyingGlassIcon className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
            <Input
              className='pl-9'
              placeholder='Search by recipient, keyspace or role…'
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {ledger.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {store.grants.length === 0 ? "No grants recorded in this browser." : "No grants match your search."}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[56rem] table-fixed text-sm'>
              <thead>
                <tr className='border-b text-left text-xs text-muted-foreground'>
                  <RecipientHeads />
                  <th className='w-40 font-medium'>Keyspace</th>
                  <th className='font-medium'>Granted role</th>
                  <th className='w-28 font-medium'>Granted on</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((g) => {
                  const ks = store.keyspaces.find((k) => k.id === g.keyspaceId);
                  return (
                    <tr
                      key={grantKey(g)}
                      onClick={() => select(g.keyspaceId, grantPath(g) ?? "keyspace")}
                      className='cursor-pointer border-b last:border-0 hover:bg-accent/50'
                    >
                      <RecipientCells store={store} g={g} onRename={setRenameKey} />
                      <td>
                        <p className='font-medium'>{ks?.label || "Unlabeled keyspace"}</p>
                        <p className='flex items-center gap-1 font-mono text-xs text-muted-foreground'>
                          {shortId(g.keyspaceId)}
                          <CopyButton value={`ks_${g.keyspaceId}`} />
                        </p>
                      </td>
                      <td className='font-mono'>{grantPath(g) ?? "Whole keyspace"}</td>
                      <td className='text-muted-foreground'>{fmt(g.issuedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <BrowserOnlyNotice state={state} />

      <Dialog open={renameKey !== null} onOpenChange={(o) => !o && setRenameKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename recipient</DialogTitle>
            <DialogDescription>
              An alias is a name for this recipient in this console only. It isn't part of the grant, it isn't on-chain,
              and the recipient never sees it. Saved in this browser.
            </DialogDescription>
          </DialogHeader>
          {renameKey !== null && (
            <AliasDialog key={renameKey} store={store} keyId={renameKey} onClose={() => setRenameKey(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ksDialog !== null} onOpenChange={(o) => !o && setKsDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ksDialog === "rename" ? "Rename keyspace" : "New keyspace"}</DialogTitle>
            <DialogDescription>
              {ksDialog === "rename"
                ? "The label is saved in this browser only."
                : "One wallet signature creates the keyspace."}
            </DialogDescription>
          </DialogHeader>
          {ksDialog && (
            <KeyspaceDialog
              key={ksDialog + (sel?.ks ?? "")}
              mode={ksDialog}
              ks={selKs}
              store={store}
              onDone={(id) => select(id, "keyspace")}
              onClose={() => setKsDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={grantDlg !== null} onOpenChange={(o) => !o && setGrantDlg(null)}>
        <DialogContent className='sm:max-w-xl'>
          {grantDlg && (
            <GrantDialog
              key={JSON.stringify(grantDlg)}
              store={store}
              scope={grantDlg}
              onClose={() => setGrantDlg(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
