"use client";
// PROTOTYPE, throwaway. Grant step body for a centred dialog. Picker pattern copied from DepositTokenPicker.
import { Button } from "@filecoin-pay/ui/components/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@filecoin-pay/ui/components/dialog";
import { Input } from "@filecoin-pay/ui/components/input";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { AlertCircle, ChevronDown, KeyRound, Lock, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/shared/Notice";
import { dataText, ResultBlock, type Scope, type Store } from "./grant-shared";
import { fakeBlob, fakeId, type Keyspace, ksName, type Role, shortAddr, shortId } from "./mock-data";

const rowClasses =
  "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50";
const PUBKEY = /^0x04[0-9a-fA-F]{128}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ROLE_PATH = /^[\w.-]+(\/[\w.-]+)*$/;
const segs = (p: string) => p.split("/");

/** Input + chevron on top, expanding list below, in one bordered box (as in the deposit token picker). */
function Combo({
  label,
  text,
  onText,
  placeholder,
  open,
  setOpen,
  list,
  below,
  mono,
}: {
  label: string;
  text: string;
  onText: (v: string) => void;
  placeholder: string;
  open: boolean;
  setOpen: (o: boolean) => void;
  list: ReactNode;
  below?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className='grid gap-2'>
      <span className='text-sm font-medium text-foreground'>{label}</span>
      <div className='divide-y overflow-hidden rounded-lg border bg-background'>
        <div className='flex items-center'>
          <input
            value={text}
            placeholder={placeholder}
            onChange={(e) => onText(e.target.value)}
            onFocus={() => setOpen(true)}
            className={cn("min-w-0 flex-1 bg-transparent p-3 text-sm outline-none", mono && "font-mono")}
          />
          <button
            type='button'
            aria-label={`${label} options`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className='p-3'
          >
            <ChevronDown
              className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
              aria-hidden='true'
            />
          </button>
        </div>
        {open ? <ul className='max-h-56 divide-y overflow-y-auto'>{list}</ul> : null}
      </div>
      {below}
    </div>
  );
}

const Err = ({ children }: { children: ReactNode }) => (
  <p className='flex items-center gap-2 text-sm text-destructive'>
    <AlertCircle className='size-4 shrink-0' aria-hidden='true' />
    {children}
  </p>
);

export function GrantDialog({ store, scope, onClose }: { store: Store; scope: Scope; onClose: () => void }) {
  // Recipient. Prefilled as if it came from the authorize URL's `recipient` param.
  const [rPick, setRPick] = useState<string | null>(
    scope.recipient ?? store.sessionKeys.find((s) => s.publicKey)?.address ?? null,
  );
  const [rText, setRText] = useState("");
  const [rLabel, setRLabel] = useState("");
  const [rAddr, setRAddr] = useState("");
  const [rOpen, setROpen] = useState(false);
  // Keyspace.
  const [kPick, setKPick] = useState<string | null>(scope.keyspaceId ?? null);
  const [kText, setKText] = useState("");
  const [kCreate, setKCreate] = useState(false);
  const [signed, setSigned] = useState(false);
  const [kOpen, setKOpen] = useState(false);
  // Role. `whole` = keyspace grant.
  const [whole, setWhole] = useState(scope.roleOrKeyspace === "keyspace");
  const [path, setPath] = useState(scope.roleOrKeyspace?.startsWith("role:") ? scope.roleOrKeyspace.slice(5) : "");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [child, setChild] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [blob, setBlob] = useState<string | null>(null);

  // ---- recipient derivation
  const picked = store.sessionKeys.find((s) => s.address === rPick) ?? null;
  const pasted = rText.trim();
  const pastedValid = PUBKEY.test(pasted);
  const known = picked ?? (pastedValid ? store.sessionKeys.find((s) => s.publicKey === pasted) : undefined) ?? null;
  const addrTrim = rAddr.trim();
  const addrOk = !addrTrim || ADDRESS.test(addrTrim);
  const recipientOk = known ? !!known.publicKey : pastedValid && addrOk;
  const rShown = picked ? picked.label || shortAddr(picked.address) : rText;
  const rFilter = picked ? "" : pasted.toLowerCase();
  const rRows = store.sessionKeys.filter(
    (s) => !rFilter || s.label.toLowerCase().includes(rFilter) || s.address.toLowerCase().includes(rFilter),
  );

  // ---- keyspace derivation
  const ks = store.keyspaces.find((k) => k.id === kPick) ?? null;
  const kName = kText.trim();
  const kShown = ks ? ksName(ks) : kText;
  const kRows = store.keyspaces.filter((k) => ks || !kName || ksName(k).toLowerCase().includes(kName.toLowerCase()));
  const canOfferCreate = !ks && !!kName && !store.keyspaces.some((k) => k.label.toLowerCase() === kName.toLowerCase());
  const keyspaceOk = !!ks || (kCreate && !!kName && signed);

  // ---- role tree for the chosen keyspace
  const records = new Set(ks ? store.roles.filter((r) => r.keyspaceId === ks.id).map((r) => r.path) : []);
  const all = new Set<string>();
  for (const p of [...records, ...drafts])
    for (let i = 1; i <= segs(p).length; i++) all.add(segs(p).slice(0, i).join("/"));
  const nodes = [...all].sort();
  const pathTrim = path.trim();
  const pathFormatOk = ROLE_PATH.test(pathTrim);
  const roleOk = whole ? confirm : pathFormatOk;
  const isNewRole = !whole && pathFormatOk && !all.has(pathTrim);

  const ok = recipientOk && keyspaceOk && roleOk;

  const recipientNote = () => {
    if (!picked && !pasted) return null;
    if (!picked && !pastedValid) return <Err>Not a recipient key</Err>;
    if (known) {
      const key = known.publicKey ?? "";
      return (
        <dl className='grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm'>
          <dt className='text-muted-foreground'>Alias</dt>
          <dd className='font-medium'>{store.aliases[key] || known.label || "Unnamed recipient"}</dd>
          <dt className='text-muted-foreground'>Address</dt>
          <dd className='font-mono text-xs'>{known.address}</dd>
          <dt className='text-muted-foreground'>Recipient key</dt>
          <dd className='break-all font-mono text-xs'>{key || "No public key in this browser"}</dd>
        </dl>
      );
    }
    return (
      <div className='space-y-2'>
        <p className='text-sm font-medium'>New recipient</p>
        <Input placeholder='Alias (this browser only)' value={rLabel} onChange={(e) => setRLabel(e.target.value)} />
        <Input
          className='font-mono'
          placeholder='Session key address (optional, not verified)'
          value={rAddr}
          onChange={(e) => setRAddr(e.target.value)}
        />
        {!addrOk && <Err>Not a valid 0x address</Err>}
        <p className='text-xs text-muted-foreground'>
          The console can't check that this address and recipient key belong together. A mismatch only mislabels the
          grant. Only the recipient key's holder can open it.
        </p>
      </div>
    );
  };
  const roleNote = () => {
    if (whole)
      return <p className='text-xs text-muted-foreground'>Whole keyspace selected: this will be a keyspace grant.</p>;
    if (pathTrim && !pathFormatOk) return <Err>Invalid role path</Err>;
    if (isNewRole) return <p className='text-xs font-medium text-blue-700 dark:text-blue-300'>New role</p>;
    return null;
  };

  const selectKeyspace = (id: string | null) => {
    setKPick(id);
    setDrafts([]);
    setAdding(null);
  };
  const addChild = (parent: string) => {
    const seg = child.trim();
    setAdding(null);
    setChild("");
    if (!seg || seg.includes("/") || !ROLE_PATH.test(seg)) return;
    const full = parent ? `${parent}/${seg}` : seg;
    setDrafts((d) => (d.includes(full) ? d : [...d, full]));
    setWhole(false);
    setPath(full);
  };

  const issue = () => {
    const ksId = ks ? ks.id : fakeId() + fakeId();
    const newKs: Keyspace | null = ks
      ? null
      : {
          id: ksId,
          epoch: 1,
          commitment: `0x${fakeId().slice(0, 4)}…${fakeId().slice(0, 4)}`,
          label: kName,
          createdAt: Date.now(),
          onChain: null,
        };
    const role: Role | null =
      !whole && !records.has(pathTrim) ? { keyspaceId: ksId, path: pathTrim, createdAt: Date.now() } : null;
    store.commit(newKs, role, {
      keyspaceId: ksId,
      node: whole ? "keyspace" : `role:${pathTrim}`,
      recipientAddress: known?.address ?? addrTrim,
      recipientPublicKey: known?.publicKey ?? pasted,
      recipientLabel: known ? undefined : rLabel.trim() || undefined,
      issuedAt: Date.now(),
    });
    setBlob(`fgr1_${fakeBlob()}`);
  };

  const TreeRow = ({ id, label, depth, virtual }: { id: string; label: string; depth: number; virtual?: boolean }) => {
    const isWhole = id === "keyspace";
    const selected = isWhole ? whole : !whole && pathTrim === id;
    return (
      <li>
        <div
          className={cn(
            "group flex items-center gap-1 pr-2",
            selected ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-muted/50",
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            type='button'
            className={cn(
              "flex-1 py-1.5 text-left text-sm",
              virtual && "text-muted-foreground",
              isWhole ? "font-medium" : "font-mono",
            )}
            onClick={() => {
              setWhole(isWhole);
              setPath(isWhole ? "" : id);
            }}
          >
            {label}
          </button>
          <button
            type='button'
            aria-label='Add child role'
            className='rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100'
            onClick={() => {
              setAdding(id);
              setChild("");
            }}
          >
            <Plus className='size-3.5' aria-hidden='true' />
          </button>
        </div>
        {adding === id && (
          <div style={{ paddingLeft: 8 + (depth + 1) * 16 }} className='py-1 pr-2'>
            <Input
              autoFocus
              className='h-7 font-mono text-xs'
              placeholder='new-role'
              value={child}
              onChange={(e) => setChild(e.target.value)}
              onBlur={() => setAdding(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChild(isWhole ? "" : id);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(null);
                }
              }}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Grant access</DialogTitle>
        <DialogDescription>Wrap a keyspace or role key to a session key's public key.</DialogDescription>
      </DialogHeader>

      {blob ? (
        <>
          <ResultBlock blob={blob} />
          <div className='flex justify-end'>
            <Button onClick={onClose}>Done</Button>
          </div>
        </>
      ) : (
        <>
          <div className='max-h-[65vh] space-y-5 overflow-y-auto pr-1'>
            <Combo
              label='Recipient'
              text={rShown}
              onText={(v) => {
                setRPick(null);
                setRText(v);
              }}
              placeholder='Pick a session key, or paste a recipient key (0x04…)'
              open={rOpen}
              setOpen={setROpen}
              mono={!picked}
              list={
                <>
                  {rRows.map((s) => (
                    <li key={s.address}>
                      <button
                        type='button'
                        disabled={!s.publicKey}
                        className={cn(rowClasses, "justify-between")}
                        onClick={() => {
                          setRPick(s.address);
                          setRText("");
                          setROpen(false);
                        }}
                      >
                        <span className='flex min-w-0 items-center gap-3'>
                          <KeyRound className='size-5 shrink-0' aria-hidden='true' />
                          <span className='flex min-w-0 flex-col'>
                            <span className='truncate font-medium'>{s.label || shortAddr(s.address)}</span>
                            <span className='font-mono text-[0.6875rem] text-muted-foreground'>
                              {shortAddr(s.address)}
                            </span>
                            {!s.publicKey && (
                              <span className='whitespace-normal text-[0.6875rem] text-muted-foreground'>
                                This session key has no public key in this browser. Run{" "}
                                <code>filecoin-pin grant request</code> on its machine and paste the key.
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <div className={cn(rowClasses, "text-muted-foreground")}>
                      <span className='flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-current'>
                        <Plus className='size-3.5' aria-hidden='true' />
                      </span>
                      <span className='text-sm'>Or paste the key printed by `filecoin-pin grant request`</span>
                    </div>
                  </li>
                </>
              }
              below={recipientNote()}
            />

            <Combo
              label='Keyspace'
              text={kShown}
              onText={(v) => {
                selectKeyspace(null);
                setKCreate(false);
                setSigned(false);
                setKText(v);
              }}
              placeholder='Pick a keyspace, or type a name to create one'
              open={kOpen}
              setOpen={setKOpen}
              list={
                <>
                  {kRows.map((k) => (
                    <li key={k.id}>
                      <button
                        type='button'
                        className={cn(rowClasses, "justify-between")}
                        onClick={() => {
                          selectKeyspace(k.id);
                          setKCreate(false);
                          setKText("");
                          setKOpen(false);
                        }}
                      >
                        <span className='flex min-w-0 items-center gap-3'>
                          <Lock className='size-5 shrink-0' aria-hidden='true' />
                          <span className='truncate font-medium'>{k.label || shortId(k.id)}</span>
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground'>
                          {store.roles.filter((r) => r.keyspaceId === k.id).length} roles · {dataText(k)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {canOfferCreate && (
                    <li>
                      <button
                        type='button'
                        className={cn(rowClasses, "text-muted-foreground hover:text-foreground")}
                        onClick={() => {
                          setKCreate(true);
                          setKOpen(false);
                        }}
                      >
                        <span className='flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-current'>
                          <Plus className='size-3.5' aria-hidden='true' />
                        </span>
                        <span className='text-sm font-medium'>Create keyspace "{kName}"</span>
                      </button>
                    </li>
                  )}
                  {kRows.length === 0 && !canOfferCreate && (
                    <li className='p-3 text-sm text-muted-foreground'>No keyspaces yet. Type a name to create one.</li>
                  )}
                </>
              }
              below={
                kCreate && !ks ? (
                  <div className='flex items-center gap-3'>
                    <Button
                      size='sm'
                      variant={signed ? "secondary" : "default"}
                      disabled={signed}
                      onClick={() => setSigned(true)}
                    >
                      {signed ? "Signed" : "Sign with your wallet (one signature)"}
                    </Button>
                    <span className='text-xs text-muted-foreground'>Creates "{kName}" with no data yet.</span>
                  </div>
                ) : null
              }
            />

            <div className='grid gap-2'>
              <span className='text-sm font-medium'>Role</span>
              <Input
                className='font-mono'
                placeholder='research/datasets/papers'
                value={whole ? "" : path}
                disabled={!ks && !kCreate}
                onChange={(e) => {
                  setWhole(false);
                  setPath(e.target.value);
                }}
              />
              {roleNote()}
              <p className='text-xs text-muted-foreground'>
                Role names are public: they're stored in clear in every encrypted file.
              </p>
              {ks || kCreate ? (
                <ul className='max-h-52 divide-y overflow-y-auto rounded-lg border bg-background'>
                  <TreeRow id='keyspace' label='Whole keyspace' depth={0} />
                  {nodes.map((n) => (
                    <TreeRow
                      key={n}
                      id={n}
                      label={segs(n).at(-1) ?? n}
                      depth={segs(n).length}
                      virtual={!records.has(n) && !drafts.includes(n)}
                    />
                  ))}
                </ul>
              ) : (
                <p className='text-xs text-muted-foreground'>Choose a keyspace to see its roles.</p>
              )}
              {whole && (
                <Notice tone='warn' title='Keyspace grants are permanent'>
                  <p>
                    This gives permanent read access to everything in the keyspace and lets the holder write under any
                    role. It can't be revoked; the only fix is a new epoch plus re-encryption. Recommended only for your
                    own devices or a backup service.
                  </p>
                  <label className='mt-2 flex items-center gap-2'>
                    <input type='checkbox' checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />I
                    understand
                  </label>
                </Notice>
              )}
            </div>
          </div>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!ok} onClick={issue}>
              Issue grant
            </Button>
          </div>
        </>
      )}
    </>
  );
}
