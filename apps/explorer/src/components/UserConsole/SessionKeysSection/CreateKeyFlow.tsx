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
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import CopyButton from "@/components/shared/CopyButton";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { download } from "@/utils/download";
import {
  buildEnvSnippet,
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
  account: Hex;
  registry: { address: Hex; abi: Abi };
  onCreated: (record: SessionKeyRecord) => void;
  /** Fires when the login tx is confirmed onchain (used to refresh chain-read statuses). */
  onConfirmed?: () => void;
  /** Fires when a submitted login tx fails onchain — removes the optimistically added row. */
  onFailed?: (sessionKeyPublic: Hex) => void;
}

interface GeneratedKey {
  privateKey: Hex;
  address: Hex;
}

type TxState = "idle" | "pending" | "confirmed" | "failed";

// Nothing is pre-selected: the owner ticks each scope the key holder needs.
const EMPTY_SELECTION = Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, false])) as Record<ScopeId, boolean>;

/**
 * Create flow + reveal. One wallet transaction calling the registry's
 * `login(signer, expiry, [scopes], name)` — "login" is SessionKeyRegistry's
 * ABI name for granting an authorization, not a wallet connect.
 * The session signer is always generated locally in the browser — its private key
 * never exists onchain, on our servers, or anywhere else.
 *
 */
export const CreateKeyFlow: React.FC<CreateKeyFlowProps> = ({
  open,
  onOpenChange,
  account,
  registry,
  onCreated,
  onConfirmed,
  onFailed,
}) => {
  const [step, setStep] = useState<"form" | "reveal">("form");
  const [txState, setTxState] = useState<TxState>("idle");
  const [name, setName] = useState("");
  const [checkedScopes, setCheckedScopes] = useState<Record<ScopeId, boolean>>(EMPTY_SELECTION);
  const [presetIndex, setPresetIndex] = useState("1"); // default 30 days
  const [customDate, setCustomDate] = useState("");
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);
  const [expirySec, setExpirySec] = useState<bigint>(0n);
  // Tracks the submitted login until its receipt settles. `uiActive` goes false
  // when the dialog is closed mid-flight so late receipts don't mutate a fresh
  // form; the row-removal on failure runs regardless (the row exists either way).
  const inFlightRef = useRef<{ address: Hex; uiActive: boolean } | null>(null);

  const { execute } = useContractTransaction({
    contractAddress: registry.address,
    abi: registry.abi,
    onSuccess: () => {
      const flight = inFlightRef.current;
      inFlightRef.current = null;
      if (flight?.uiActive) setTxState("confirmed");
      onConfirmed?.();
    },
    onError: () => {
      // receipt-level failure: authorization never happened — drop the optimistic row
      const flight = inFlightRef.current;
      inFlightRef.current = null;
      if (flight) onFailed?.(flight.address);
      if (flight?.uiActive) setTxState("failed");
    },
  });

  const selectedScopes = SESSION_KEY_SCOPES.filter((s) => checkedScopes[s.id]).map((s) => s.id);

  const expiryChoice = () => resolveExpiry(presetIndex, customDate, Date.now());

  // name is optional: the chain doesn't require an origin
  const canCreate = selectedScopes.length > 0 && expiryChoice() !== null && txState !== "pending";
  // normalizeKeyName: the raw input reaches toast titles, the dialog chrome,
  // the download filename, and the onchain origin field — strip control/bidi
  // characters and cap the length once, here, before any of those sinks.
  const cleanName = normalizeKeyName(name);
  const displayName = cleanName || "(unnamed)";

  const handleCreate = async () => {
    const expiry = expiryChoice();
    if (!expiry) return;
    const privateKey = generatePrivateKey();
    const keyAccount = privateKeyToAccount(privateKey);
    const key: GeneratedKey = { privateKey, address: keyAccount.address };
    setGenerated(key);
    const signerAddress = keyAccount.address;
    setExpirySec(expiry);
    inFlightRef.current = { address: signerAddress, uiActive: true };
    setTxState("pending");
    // Reveal the secret NOW — before confirmation — so a mid-flight close can
    // never lose the key of an authorization that lands anyway.
    setStep("reveal");
    try {
      const txHash = await execute({
        functionName: "login",
        args: [signerAddress, expiry, selectedScopes.map((id) => SCOPE_BY_ID[id].typehash), cleanName],
        metadata: { type: "createSessionKey", keyName: cleanName },
      });
      onCreated({
        name: cleanName,
        sessionKeyPublic: signerAddress,
        scopes: selectedScopes,
        createdAt: Date.now(),
        txHash,
      });
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
      buildEnvSnippet(generated.privateKey, generated.address, account),
      "text/plain",
    );
  };

  const expiryDate = expirySec > 0n ? new Date(Number(expirySec) * 1000) : null;
  const scopeLabels = selectedScopes.map((id) => SCOPE_BY_ID[id].label).join(", ");

  const txBanner =
    txState === "pending" ? (
      <div className='rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900 p-3 text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2'>
        <Loader2 className='h-4 w-4 animate-spin shrink-0' />
        <span>
          <b>Waiting for confirmation…</b> keep this window open. Save your session key below in the meantime.
        </span>
      </div>
    ) : txState === "failed" ? (
      <div className='rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 p-3 text-sm text-red-900 dark:text-red-200'>
        <b>Authorization failed.</b> The transaction did not go through, so this key was never registered. Discard it
        and try again.
      </div>
    ) : (
      <div className='rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-900 p-3 text-sm text-green-900 dark:text-green-200'>
        ✓ <b>{displayName}</b> is active until {expiryDate ? expiryDate.toLocaleDateString() : "—"} · scopes:{" "}
        {scopeLabels}
      </div>
    );

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

            <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 flex flex-col gap-3'>
              <p className='text-sm font-semibold text-amber-900 dark:text-amber-200'>
                ⚠ Copy your session key now — it won't be shown again.
              </p>
              <div className='relative'>
                <code className='block rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 pr-10 text-xs break-all whitespace-pre-wrap'>
                  {generated ? buildEnvSnippet(generated.privateKey, generated.address, account) : ""}
                </code>
                <CopyButton
                  value={generated ? buildEnvSnippet(generated.privateKey, generated.address, account) : ""}
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
                password. The snippet above is a ready-to-paste env file. It is shown only once.
              </p>
            </div>

            <DialogFooter>
              <Button variant='primary' size='compact' onClick={closeDialog}>
                {txState === "failed" ? "Close" : "Done — I saved the key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
