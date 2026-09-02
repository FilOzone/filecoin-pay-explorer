"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Abi, Hex } from "viem";
import { isAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { SessionKeysIdentity } from "@/hooks/useSessionKeys";
import type { Network } from "@/types";
import { download } from "@/utils/download";
import {
  buildEnvSnippet,
  buildLoginArgs,
  EXPIRY_PRESETS,
  normalizeKeyName,
  resolveExpiry,
  SCOPE_BY_ID,
  type ScopeId,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
} from "@/utils/sessionKeys";

interface CreateKeyFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: Network;
  account: Hex;
  registry: { address: Hex; abi: Abi };
  /** Block explorer base URL for the transaction link in toasts. */
  explorerUrl?: string;
  /** `identity` is the wallet and network at submit time, so a late callback still lands in the right inventory. */
  onCreated: (record: SessionKeyRecord, identity: SessionKeysIdentity) => void;
  /** Fires with the signer when its login tx is confirmed onchain. */
  onConfirmed?: (sessionKeyPublic: Hex) => void;
  /** Fires when a submitted login tx fails onchain — removes the optimistically added row. */
  onFailed?: (sessionKeyPublic: Hex, identity: SessionKeysIdentity) => void;
}

interface GeneratedKey {
  privateKey: Hex;
  address: Hex;
  /** The wallet that authorized the key. Pinned at generation so a later wallet switch cannot relabel the snippet. */
  walletAddress: Hex;
}

type TxState = "idle" | "pending" | "confirmed" | "failed";

// Nothing is pre-selected: the owner ticks each scope the key holder needs.
const EMPTY_SELECTION = Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, false])) as Record<ScopeId, boolean>;

/**
 * Create flow + reveal. One wallet transaction calling the registry's
 * `login(signer, expiry, [scopes], name)` — "login" is SessionKeyRegistry's
 * ABI name for granting an authorization, not a wallet connect.
 * The session signer is either generated locally in the browser — its private key
 * never exists onchain, on our servers, or anywhere else — or a public address the
 * caller already controls. On the bring-your-own-address path no secret ever
 * touches the console; the login call simply authorizes the pasted address.
 */
export const CreateKeyFlow: React.FC<CreateKeyFlowProps> = ({
  open,
  onOpenChange,
  network,
  account,
  registry,
  explorerUrl,
  onCreated,
  onConfirmed,
  onFailed,
}) => {
  const [step, setStep] = useState<"form" | "reveal" | "registered">("form");
  const [txState, setTxState] = useState<TxState>("idle");
  const [name, setName] = useState("");
  const [checkedScopes, setCheckedScopes] = useState<Record<ScopeId, boolean>>(EMPTY_SELECTION);
  const [presetIndex, setPresetIndex] = useState("1"); // default 30 days
  const [customDate, setCustomDate] = useState("");
  const [signerMode, setSignerMode] = useState<"generate" | "own">("generate");
  const [ownAddress, setOwnAddress] = useState("");
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);
  const [expirySec, setExpirySec] = useState<bigint>(0n);
  // Tracks the submitted login until its receipt settles. `uiActive` goes false
  // when the dialog is closed mid-flight so late receipts don't mutate a fresh
  // form; the row-removal on failure runs regardless (the row exists either way).
  const inFlightRef = useRef<{ address: Hex; identity: SessionKeysIdentity; uiActive: boolean } | null>(null);

  const { execute } = useContractTransaction({
    contractAddress: registry.address,
    abi: registry.abi,
    explorerUrl,
    onSuccess: () => {
      const flight = inFlightRef.current;
      inFlightRef.current = null;
      if (flight?.uiActive) {
        setTxState("confirmed");
        setStep((prev) => (prev === "form" ? "registered" : prev)); // BYO path lands on the success state
      }
      if (flight) onConfirmed?.(flight.address);
    },
    onError: () => {
      // receipt-level failure: authorization never happened — drop the optimistic row
      const flight = inFlightRef.current;
      inFlightRef.current = null;
      if (flight) onFailed?.(flight.address, flight.identity);
      if (flight?.uiActive) setTxState("failed");
    },
  });

  const selectedScopes = SESSION_KEY_SCOPES.filter((s) => checkedScopes[s.id]).map((s) => s.id);

  const expiryChoice = () => resolveExpiry(presetIndex, customDate, Date.now());

  const signerValid = signerMode === "generate" || isAddress(ownAddress);
  // name is optional: the chain doesn't require an origin
  const canCreate = selectedScopes.length > 0 && expiryChoice() !== null && signerValid && txState !== "pending";
  // normalizeKeyName: the raw input reaches toast titles, the dialog chrome,
  // the download filename, and the onchain origin field — strip control/bidi
  // characters and cap the length once, here, before any of those sinks.
  const cleanName = normalizeKeyName(name);
  const displayName = cleanName || "(unnamed)";

  const handleCreate = async () => {
    const expiry = expiryChoice();
    if (!expiry) return;
    let signerAddress: Hex;
    let key: GeneratedKey | null = null;
    if (signerMode === "generate") {
      const privateKey = generatePrivateKey();
      const keyAccount = privateKeyToAccount(privateKey);
      key = { privateKey, address: keyAccount.address, walletAddress: account };
      setGenerated(key);
      signerAddress = keyAccount.address;
    } else {
      signerAddress = ownAddress as Hex;
    }
    // Captured now: the wallet may switch before the submission resolves.
    const identity: SessionKeysIdentity = { network, account };
    setExpirySec(expiry);
    inFlightRef.current = { address: signerAddress, identity, uiActive: true };
    setTxState("pending");
    // Reveal the secret NOW — before confirmation — so a mid-flight close can
    // never lose the key of an authorization that lands anyway. The BYO path
    // has no secret, so it stays on the form until the login confirms.
    if (key) setStep("reveal");
    try {
      const txHash = await execute({
        functionName: "login",
        args: buildLoginArgs(signerAddress, expiry, selectedScopes, cleanName),
        metadata: { type: "createSessionKey", keyName: cleanName },
      });
      onCreated(
        {
          name: cleanName,
          sessionKeyPublic: signerAddress,
          scopes: selectedScopes,
          createdAt: Date.now(),
          txHash,
        },
        identity,
      );
    } catch {
      // wallet rejected / submission failed: nothing onchain, no row added.
      // Form inputs are preserved so the user can retry without retyping.
      inFlightRef.current = null;
      setGenerated(null);
      setTxState("idle");
      setStep("form");
    }
  };

  // Shared by `reset` (dialog closing) and the open-transition effect below
  // (dialog reopening). Never touches inFlightRef: a previous attempt's tx
  // keeps resolving its optimistic row/toast independently of what the
  // dialog currently shows.
  const resetFormState = useCallback(() => {
    setStep("form");
    setTxState("idle");
    setName("");
    setCheckedScopes(EMPTY_SELECTION);
    setPresetIndex("1");
    setCustomDate("");
    setSignerMode("generate");
    setOwnAddress("");
    setGenerated(null);
    setExpirySec(0n);
  }, []);

  const reset = () => {
    if (inFlightRef.current) inFlightRef.current.uiActive = false; // pending tx keeps confirming in the background
    resetFormState();
  };

  // Reopening always starts a fresh attempt, regardless of how the dialog was
  // last closed. A submitted tx needs nothing from the dialog to resolve, so
  // there's nothing to preserve here.
  useEffect(() => {
    if (open) resetFormState();
  }, [open, resetFormState]);

  const closeDialog = () => {
    reset();
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && step === "reveal" && generated) {
      // Every dismissal path except the explicit Done button warns first:
      // once this dialog closes, the secret is gone for good.
      const ok = window.confirm(
        "Make sure you have copied or downloaded your session key — it can never be shown again. Close anyway?",
      );
      if (!ok) return;
    }
    if (!next) reset();
    onOpenChange(next);
  };
  const downloadEnv = () => {
    if (!generated) return;
    download(
      `session-key-${cleanName || "unnamed"}.env`,
      buildEnvSnippet(generated.privateKey, generated.address, generated.walletAddress),
      "text/plain",
    );
  };

  const expiryDate = expirySec > 0n ? new Date(Number(expirySec) * 1000) : null;
  const scopeLabels = selectedScopes.map((id) => SCOPE_BY_ID[id].label).join(", ");

  const txBanner =
    txState === "pending" ? (
      <Notice tone='info' className='flex items-center gap-2'>
        <Loader2 className='h-4 w-4 animate-spin shrink-0' />
        <span>
          <b>Waiting for confirmation…</b> keep this window open. Save your session key below in the meantime.
        </span>
      </Notice>
    ) : txState === "failed" ? (
      <Notice tone='error'>
        <b>Authorization failed.</b> The transaction did not go through, so this key was never registered. Discard it
        and try again.
      </Notice>
    ) : (
      <Notice tone='ok'>
        ✓ <b>{displayName}</b> is active until {expiryDate ? expiryDate.toLocaleDateString() : "—"} · scopes:{" "}
        {scopeLabels}
      </Notice>
    );
  const snippet = generated ? buildEnvSnippet(generated.privateKey, generated.address, generated.walletAddress) : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-y-auto'>
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>New session key</DialogTitle>
              <DialogDescription>One wallet transaction. All selected scopes share the same expiry.</DialogDescription>
            </DialogHeader>

            <div className='flex flex-col gap-5'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='sk-name'>
                  Name <span className='text-zinc-500 font-normal'>(optional — what is this key for?)</span>
                </Label>
                <Input id='sk-name' placeholder='e.g. ci-uploader' value={name} onChange={setName} />
                <p className='text-xs text-zinc-500'>
                  Saved on chain with the key, so it is <b>public and permanent</b>. Don't put secrets in it.
                </p>
              </div>

              <div className='flex flex-col gap-2'>
                <Label>Scopes</Label>
                {SESSION_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope.id}
                    className={clsx(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                      scope.destructive
                        ? "border-amber-300 dark:border-amber-800"
                        : "border-zinc-200 dark:border-zinc-700",
                    )}
                  >
                    <input
                      type='checkbox'
                      className='mt-1'
                      checked={checkedScopes[scope.id]}
                      onChange={(e) => setCheckedScopes((prev) => ({ ...prev, [scope.id]: e.target.checked }))}
                    />
                    <span>
                      <span className='block text-sm font-medium'>
                        {scope.label}
                        {scope.destructive && (
                          <span className='ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'>
                            destructive
                          </span>
                        )}
                      </span>
                      <span className='block text-xs text-zinc-500'>{scope.description}</span>
                    </span>
                  </label>
                ))}
                <p className='text-xs text-zinc-500'>
                  Pick only what the key holder needs. Uploads need "Create data set" and "Add pieces". The two marked
                  destructive let the holder remove data or end service.
                </p>
              </div>

              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='sk-expiry'>Expiration</Label>
                <select
                  id='sk-expiry'
                  className='rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm'
                  value={presetIndex}
                  onChange={(e) => setPresetIndex(e.target.value)}
                >
                  {EXPIRY_PRESETS.map((preset, i) => (
                    <option key={preset.label} value={String(i)}>
                      {preset.label}
                    </option>
                  ))}
                  <option value='custom'>Custom date…</option>
                </select>
                {presetIndex === "custom" && (
                  <input
                    type='date'
                    aria-label='Custom expiry date'
                    className='rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm'
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                )}
                <p className='text-xs text-zinc-500'>The key stops working on this date. Every key has to expire.</p>
              </div>

              <div className='flex flex-col gap-2'>
                <Label>Session signer</Label>
                <label className='flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 cursor-pointer'>
                  <input
                    type='radio'
                    name='sk-signer'
                    className='mt-1'
                    checked={signerMode === "generate"}
                    onChange={() => setSignerMode("generate")}
                  />
                  <span>
                    <span className='block text-sm font-medium'>Generate for me (default)</span>
                    <span className='block text-xs text-zinc-500'>
                      Creates a <b>private key + public address keypair</b> in your browser. The private key is revealed
                      on the next screen but is never stored, so <b>make sure you save it somewhere safe immediately</b>
                      .
                    </span>
                  </span>
                </label>
                <label className='flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 cursor-pointer'>
                  <input
                    type='radio'
                    name='sk-signer'
                    className='mt-1'
                    checked={signerMode === "own"}
                    onChange={() => setSignerMode("own")}
                  />
                  <span className='flex-1'>
                    <span className='block text-sm font-medium'>I'll bring my own address</span>
                    <span className='block text-xs text-zinc-500'>
                      Generate the keypair yourself and paste <b>only</b> the session key's <b>public address</b> — the
                      private key should never touch this console.
                    </span>
                    {signerMode === "own" && (
                      <input
                        type='text'
                        placeholder='0x… session key public address'
                        className='mt-2 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-mono'
                        value={ownAddress}
                        onChange={(e) => setOwnAddress(e.target.value.trim())}
                      />
                    )}
                    {signerMode === "own" && ownAddress.length > 0 && !isAddress(ownAddress) && (
                      <span className='block text-xs text-red-600 mt-1'>Not a valid address.</span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant='primary' size='compact' disabled={!canCreate} onClick={handleCreate}>
                {txState === "pending" ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' /> Waiting for confirmation…
                  </span>
                ) : (
                  "Create session key"
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "reveal" && (
          <>
            <DialogHeader>
              <DialogTitle>Your session key</DialogTitle>
            </DialogHeader>

            {txBanner}

            <Notice
              tone='warn'
              title={"⚠ Copy your session key now — it won't be shown again."}
              className='p-4 flex flex-col gap-3'
            >
              <div className='relative'>
                <code className='block rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 pr-10 text-xs break-all whitespace-pre-wrap'>
                  {snippet}
                </code>
                <CopyButton
                  value={snippet}
                  tooltipText='Copy session key env snippet'
                  successMessage='Session key copied — it will not be shown again'
                  className='absolute top-2 right-2 bg-white/80 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                />
              </div>
              <div className='flex flex-wrap items-center gap-4'>
                <button
                  type='button'
                  onClick={downloadEnv}
                  className='text-xs text-zinc-600 dark:text-zinc-300 underline underline-offset-2'
                >
                  Download .env
                </button>
              </div>
              <p className='text-xs text-amber-900/80 dark:text-amber-200/80'>
                <b>SESSION_KEY is the secret.</b> It was made in your browser and is never stored here; only its address
                went on chain. Anyone who has it can use the scopes above until the key expires, so treat it like a
                password. Save the snippet as a file and point filecoin-pin at it with --credentials-file, or export the
                variables in your app's environment. It is shown only once.
              </p>
            </Notice>

            <DialogFooter>
              <Button variant='primary' size='compact' onClick={closeDialog}>
                {txState === "failed" ? "Close" : "Done — I saved the key"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "registered" && (
          <>
            <DialogHeader>
              <DialogTitle>Session key registered</DialogTitle>
              <DialogDescription>
                <b>{displayName}</b> is active until {expiryDate ? expiryDate.toLocaleDateString() : "—"} · scopes:{" "}
                {scopeLabels}
              </DialogDescription>
            </DialogHeader>
            <div className='rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-900 p-4 text-sm text-green-900 dark:text-green-200'>
              <span className='font-mono break-all'>{ownAddress}</span> is now authorized.
            </div>
            <DialogFooter>
              <Button variant='primary' size='compact' onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
