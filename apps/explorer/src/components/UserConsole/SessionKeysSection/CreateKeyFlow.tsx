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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Abi, Hex } from "viem";
import { isAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import CopyButton from "@/components/shared/CopyButton";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { presetScopeStates } from "@/utils/authorizeParam";
import { formatDateTime } from "@/utils/formatter";
import {
  buildEnvSnippet,
  EXPIRY_PRESETS,
  normalizeKeyName,
  SCOPE_BY_ID,
  type ScopeId,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
} from "@/utils/sessionKeys";
import { download } from "./download";

interface CreateKeyFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Hex;
  registry: { address: Hex; abi: Abi };

  prefillAddress?: Hex | null;
  prefillScopes?: ScopeId[] | null;
  /**
   * Turns the dialog into an add-scopes flow
   */
  existingKey?: { name: string; expirySec: bigint | null } | null;
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

// Default selection: every scope on
const FULL_SELECTION = Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, true])) as Record<ScopeId, boolean>;

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
  account,
  registry,
  prefillAddress,
  prefillScopes,
  existingKey,
  onCreated,
  onConfirmed,
  onFailed,
}) => {
  const [step, setStep] = useState<"form" | "reveal" | "registered">("form");
  const [txState, setTxState] = useState<TxState>("idle");
  const [name, setName] = useState("");
  const [checkedScopes, setCheckedScopes] = useState<Record<ScopeId, boolean>>(FULL_SELECTION);
  const [presetIndex, setPresetIndex] = useState("1"); // default 30 days
  const [customDate, setCustomDate] = useState("");
  const [signerMode, setSignerMode] = useState<"generate" | "own">("generate");
  const [ownAddress, setOwnAddress] = useState("");
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);
  const [expirySec, setExpirySec] = useState<bigint>(0n);
  // Tracks the submitted login until its receipt settles. `uiActive` goes false
  // when the dialog is closed mid-flight so late receipts don't mutate a fresh
  // form; the row-removal on failure runs regardless (the row exists either way).
  const inFlightRef = useRef<{ address: Hex; uiActive: boolean } | null>(null);

  const requestPresets = useMemo(
    () => (prefillAddress ? presetScopeStates(prefillScopes ?? []) : null),
    [prefillAddress, prefillScopes],
  );
  const isExistingKey = prefillAddress != null && existingKey != null;
  const nameLocked = isExistingKey;

  const { execute } = useContractTransaction({
    contractAddress: registry.address,
    abi: registry.abi,
    onSuccess: () => {
      const flight = inFlightRef.current;
      inFlightRef.current = null;
      if (flight?.uiActive) {
        setTxState("confirmed");
        setStep((prev) => (prev === "form" ? "registered" : prev)); // BYO path lands on the success state
      }
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

  const inheritExpiry = existingKey?.expirySec ?? null;
  const existingKeyName = existingKey?.name ?? null;

  const resolveExpiry = (): bigint | null => {
    if (inheritExpiry != null) return inheritExpiry;
    if (presetIndex === "custom") {
      if (!customDate) return null;
      const ts = Math.floor(new Date(`${customDate}T23:59:59`).getTime() / 1000);
      return ts > Date.now() / 1000 ? BigInt(ts) : null;
    }
    const preset = EXPIRY_PRESETS[Number(presetIndex)];
    return preset ? BigInt(Math.floor(Date.now() / 1000) + preset.seconds) : null;
  };

  const signerValid = signerMode === "generate" || isAddress(ownAddress);
  // name is optional: the chain doesn't require an origin
  const canCreate = selectedScopes.length > 0 && resolveExpiry() !== null && signerValid && txState !== "pending";
  // normalizeKeyName: the raw input reaches toast titles, the dialog chrome,
  // the download filename, and the onchain origin field — strip control/bidi
  // characters and cap the length once, here, before any of those sinks.
  const cleanName = normalizeKeyName(name);
  const displayName = cleanName || "(unnamed)";
  const scopeLabels = selectedScopes.map((id) => SCOPE_BY_ID[id].label).join(", ");

  const handleCreate = async () => {
    const expiry = resolveExpiry();
    if (!expiry) return;
    let signerAddress: Hex;
    let key: GeneratedKey | null = null;
    if (signerMode === "generate") {
      const privateKey = generatePrivateKey();
      const keyAccount = privateKeyToAccount(privateKey);
      key = { privateKey, address: keyAccount.address };
      setGenerated(key);
      signerAddress = keyAccount.address;
    } else {
      signerAddress = ownAddress as Hex;
    }
    setExpirySec(expiry);
    inFlightRef.current = { address: signerAddress, uiActive: true };
    setTxState("pending");
    // Reveal the secret NOW — before confirmation — so a mid-flight close can
    // never lose the key of an authorization that lands anyway. The BYO path
    // has no secret, so it stays on the form until the login confirms.
    if (key) setStep("reveal");
    try {
      const txHash = await execute({
        functionName: "login",
        args: [signerAddress, expiry, selectedScopes.map((id) => SCOPE_BY_ID[id].typehash), cleanName],
        metadata: { type: isExistingKey ? "authorizeSessionKey" : "createSessionKey", keyName: cleanName },
      });
      onCreated({
        name: displayName,
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
    setCheckedScopes(FULL_SELECTION);
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

  // Declared AFTER the fresh-attempt
  // reset effect: both fire on the open transition and run in declaration
  // order, so the reset must never clobber the request's prefill.
  useEffect(() => {
    if (open && prefillAddress) {
      setSignerMode("own");
      setOwnAddress(prefillAddress);
      if (existingKeyName != null) setName(existingKeyName);
      if (requestPresets) {
        setCheckedScopes(
          Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, requestPresets[s.id] === "checked"])) as Record<
            ScopeId,
            boolean
          >,
        );
      }
    }
  }, [open, prefillAddress, existingKeyName, requestPresets]);

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

  const txBanner =
    txState === "pending" ? (
      <div className='rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900 p-3 text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2'>
        <Loader2 className='h-4 w-4 animate-spin shrink-0' />
        <span>
          <b>Confirming onchain…</b> keep this window open. Save your session key below in the meantime.
        </span>
      </div>
    ) : txState === "failed" ? (
      <div className='rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 p-3 text-sm text-red-900 dark:text-red-200'>
        <b>Authorization failed.</b> The transaction did not land, so this key was never registered onchain — discard it
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
              <DialogTitle>{isExistingKey ? "Add scopes to session key" : "New session key"}</DialogTitle>
              <DialogDescription>
                {isExistingKey
                  ? "Newly selected scopes are added to this key."
                  : "All selected scopes share the same expiry."}
              </DialogDescription>
            </DialogHeader>

            <div className='flex flex-col gap-5'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='sk-name'>
                  Name{" "}
                  {!nameLocked && <span className='text-zinc-500 font-normal'>(optional — what is this key for?)</span>}
                </Label>
                <Input
                  id='sk-name'
                  placeholder='e.g. ci-uploader'
                  value={name}
                  onChange={setName}
                  disabled={nameLocked}
                />
                {nameLocked ? (
                  <p className='text-xs text-zinc-500'>Existing key name.</p>
                ) : (
                  <p className='text-xs text-zinc-500'>
                    Stored as the <span className='font-mono'>origin</span> field of the onchain event —{" "}
                    <b>public and permanent</b>, so no secrets here.
                  </p>
                )}
              </div>

              <div className='flex flex-col gap-2'>
                <Label>Scopes</Label>
                {SESSION_KEY_SCOPES.map((scope) => {
                  const preset = requestPresets?.[scope.id] ?? null;
                  const lockedOff = preset === "locked-off";
                  return (
                    <label
                      key={scope.id}
                      className={clsx(
                        "flex items-start gap-3 rounded-lg border p-3",
                        lockedOff ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        scope.destructive
                          ? "border-amber-300 dark:border-amber-800"
                          : "border-zinc-200 dark:border-zinc-700",
                      )}
                    >
                      <input
                        type='checkbox'
                        className='mt-1'
                        disabled={lockedOff}
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
                          {lockedOff && <span className='ml-2 text-xs font-normal text-zinc-500'>Not requested</span>}
                        </span>
                        <span className='block text-xs text-zinc-500'>{scope.description}</span>
                        {preset === "requested-unchecked" && !checkedScopes[scope.id] && (
                          <span className='block text-xs mt-1 text-amber-700 dark:text-amber-400'>
                            Requested, check to include
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {requestPresets ? (
                  prefillScopes == null || prefillScopes.length === 0 ? (
                    <p className='text-xs text-amber-700 dark:text-amber-400'>
                      This link didn't request any scopes — every scope is unchecked.
                    </p>
                  ) : (
                    prefillScopes.some((id) => !checkedScopes[id]) && (
                      <p className='text-xs text-amber-700 dark:text-amber-400'>
                        Granting fewer scopes than requested — some operations may fail.
                      </p>
                    )
                  )
                ) : (
                  <p className='text-xs text-zinc-500'>
                    Selected the scopes are requested. Uncheck the destructive ones when the key holder should never be
                    able to remove data or terminate service.
                  </p>
                )}
              </div>

              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='sk-expiry'>Expiration</Label>
                {inheritExpiry != null ? (
                  <p className='text-sm'>{formatDateTime(Number(inheritExpiry) * 1000)}</p>
                ) : (
                  <>
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
                        className='rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm'
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                      />
                    )}
                    <p className='text-xs text-zinc-500'>
                      Enforced onchain — after this the key simply stops working. No “never expires” option, on purpose.
                    </p>
                  </>
                )}
              </div>

              <div className='flex flex-col gap-2'>
                <Label>Session signer</Label>
                {!isExistingKey && (
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
                        Creates a <b>private key + public address keypair</b> in your browser. The private key is
                        revealed on the next screen — it never exists onchain, on our servers, or anywhere else.
                      </span>
                    </span>
                  </label>
                )}
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
                      Generate the keypair yourself and paste only the session key's <b>public address</b> — the private
                      key never touches this console.
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
                    {signerMode === "own" && prefillAddress != null && ownAddress === prefillAddress && (
                      <span className='block text-xs text-amber-700 dark:text-amber-400 mt-1'>
                        Only approve if this matches the address you are adding.
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant='primary' size='compact' disabled={!canCreate} onClick={handleCreate}>
                {txState === "pending" ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' /> Confirming onchain…
                  </span>
                ) : isExistingKey ? (
                  "Authorize scopes"
                ) : prefillAddress ? (
                  "Review & authorize"
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
                The <b>SESSION_KEY value is the secret (the key's private key)</b> — generated locally in your browser,
                never stored by the console; only its address went onchain. The snippet above is a ready-to-paste env
                file. Anyone holding the secret can use exactly the scopes above until expiry — treat it like a
                password. It's shown only this once.
              </p>
            </div>

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
              <span className='font-mono break-all'>{ownAddress}</span> is now authorized. Its private key never touched
              this console — keep using it wherever you generated it.
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
