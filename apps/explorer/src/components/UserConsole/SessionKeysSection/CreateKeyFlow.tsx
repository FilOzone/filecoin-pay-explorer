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
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Abi, Hex } from "viem";
import { isAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { Network } from "@/types";
import {
  buildEnvSnippet,
  EXPIRY_PRESETS,
  SCOPE_BY_ID,
  type ScopeId,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
  serializeInventory,
} from "@/utils/sessionKeys";
import { download } from "./download";

interface CreateKeyFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: Network;
  account: Hex;
  registry: { address: Hex; abi: Abi };
  /** Validated CLI pairing address (?authorize=) — prefills the bring-your-own-address field, never auto-submits. */
  prefillAddress?: Hex | null;
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

/**
 * Create flow + reveal. One wallet transaction: login(signer, expiry, [scopes], name).
 *
 * Tx lifecycle: there is deliberately no Cancel button — a submitted
 * transaction cannot be cancelled, so offering Cancel would lie. The dialog
 * stays closable even while a tx is pending (it completes onchain regardless;
 * toasts and live status reads report the outcome). On the generate path the
 * reveal screen appears IMMEDIATELY at submission so a mid-flight close can
 * never destroy the secret of an authorization that lands anyway.
 * Wallet-rejected submission -> back to the form, keypair discarded, no row.
 * Submitted-but-reverted -> failure banner + optimistic row removed.
 */
export const CreateKeyFlow: React.FC<CreateKeyFlowProps> = ({
  open,
  onOpenChange,
  network,
  account,
  registry,
  prefillAddress,
  onCreated,
  onConfirmed,
  onFailed,
}) => {
  const [step, setStep] = useState<"form" | "reveal" | "registered">("form");
  const [txState, setTxState] = useState<TxState>("idle");
  const [name, setName] = useState("");
  const [checkedScopes, setCheckedScopes] = useState<Record<ScopeId, boolean>>({
    createDataSet: true,
    addPieces: true,
  });
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

  // CLI pairing (?authorize=): each time the dialog opens while a request is
  // pending, switch to the bring-your-own-address mode with the requested
  // address filled in. Prefill ONLY — the user still reviews scopes, expiry,
  // and the address itself, and must click to sign.
  useEffect(() => {
    if (open && prefillAddress) {
      setSignerMode("own");
      setOwnAddress(prefillAddress);
    }
  }, [open, prefillAddress]);

  const { execute, isExecuting } = useContractTransaction({
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

  const resolveExpiry = (): bigint | null => {
    if (presetIndex === "custom") {
      if (!customDate) return null;
      const ts = Math.floor(new Date(`${customDate}T23:59:59`).getTime() / 1000);
      return ts > Date.now() / 1000 ? BigInt(ts) : null;
    }
    const preset = EXPIRY_PRESETS[Number(presetIndex)];
    return preset ? BigInt(Math.floor(Date.now() / 1000) + preset.seconds) : null;
  };

  const signerValid = signerMode === "generate" || isAddress(ownAddress);
  // name is optional: the chain doesn't require an origin, so neither do we
  const canCreate = selectedScopes.length > 0 && resolveExpiry() !== null && signerValid && !isExecuting;
  const displayName = name.trim() || "(unnamed)";

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
    // never lose the key of an authorization that lands anyway.
    if (key) setStep("reveal");
    try {
      const txHash = await execute({
        functionName: "login",
        args: [signerAddress, expiry, selectedScopes.map((id) => SCOPE_BY_ID[id].typehash), name.trim()],
        metadata: { type: "createSessionKey", keyName: name.trim() },
      });
      onCreated({
        name: displayName,
        sessionKeyPublic: signerAddress,
        scopes: selectedScopes,
        createdAt: Date.now(),
        txHash,
        source: "created",
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

  const reset = () => {
    if (inFlightRef.current) inFlightRef.current.uiActive = false; // pending tx keeps confirming in the background
    setStep("form");
    setTxState("idle");
    setName("");
    setCheckedScopes({ createDataSet: true, addPieces: true });
    setPresetIndex("1");
    setCustomDate("");
    setSignerMode("generate");
    setOwnAddress("");
    setGenerated(null);
    setExpirySec(0n);
  };

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

  const copySecret = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.privateKey);
    toast.success("Session key copied", { description: "Store it somewhere safe — it won't be shown again." });
  };

  const downloadEnv = () => {
    if (!generated) return;
    download(
      `session-key-${name.trim() || "unnamed"}.env`,
      buildEnvSnippet(generated.privateKey, generated.address, account),
      "text/plain",
    );
  };

  const downloadInventory = () => {
    const record: SessionKeyRecord = {
      name: displayName,
      sessionKeyPublic: (generated?.address ?? ownAddress) as Hex,
      scopes: selectedScopes,
      createdAt: Date.now(),
      source: "created",
    };
    download(
      `session-key-${name.trim() || "unnamed"}-inventory.json`,
      serializeInventory(network, account, [record]),
      "application/json",
    );
  };

  const expiryDate = expirySec > 0n ? new Date(Number(expirySec) * 1000) : null;
  const scopeLabels = selectedScopes.map((id) => SCOPE_BY_ID[id].label).join(", ");

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
      <DialogContent className='sm:max-w-xl'>
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>New session key</DialogTitle>
              <DialogDescription>
                One wallet transaction (login). All selected scopes share the same expiry.
              </DialogDescription>
            </DialogHeader>

            <div className='flex flex-col gap-5'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='sk-name'>
                  Name <span className='text-zinc-500 font-normal'>(optional — what is this key for?)</span>
                </Label>
                <Input id='sk-name' placeholder='e.g. ci-uploader' value={name} onChange={setName} />
                <p className='text-xs text-zinc-500'>
                  Stored as the <span className='font-mono'>origin</span> field of the onchain event —{" "}
                  <b>public and permanent</b>, so no secrets here.
                </p>
              </div>

              <div className='flex flex-col gap-2'>
                <Label>Scopes</Label>
                {SESSION_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope.id}
                    className='flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 cursor-pointer'
                  >
                    <input
                      type='checkbox'
                      className='mt-1'
                      checked={checkedScopes[scope.id]}
                      onChange={(e) => setCheckedScopes((prev) => ({ ...prev, [scope.id]: e.target.checked }))}
                    />
                    <span>
                      <span className='block text-sm font-medium'>{scope.label}</span>
                      <span className='block text-xs text-zinc-500'>{scope.description}</span>
                    </span>
                  </label>
                ))}
                <p className='text-xs text-zinc-500'>
                  More scopes (remove pieces, terminate) intentionally not offered in v1.
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
                    className='rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm'
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                )}
                <p className='text-xs text-zinc-500'>
                  Enforced onchain — after this the key simply stops working. No “never expires” option, on purpose.
                </p>
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
                      on the next screen — it never exists onchain, on our servers, or anywhere else.
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
                        Only approve if this matches the address your CLI printed.
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant='primary' size='compact' disabled={!canCreate} onClick={handleCreate}>
                {isExecuting ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' /> Confirming onchain…
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
              <code className='block rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-xs break-all'>
                {generated?.privateKey}
              </code>
              <div className='flex gap-2 flex-wrap'>
                <Button variant='ghost' size='compact' onClick={copySecret}>
                  Copy session key
                </Button>
                <Button variant='ghost' size='compact' onClick={downloadEnv}>
                  Download .env (contains the session key)
                </Button>
                <Button variant='ghost' size='compact' onClick={downloadInventory}>
                  Download inventory (no secrets)
                </Button>
              </div>
              <p className='text-xs text-amber-900/80 dark:text-amber-200/80'>
                This is the session key's <b>secret (its private key)</b> — generated locally in your browser, never
                stored by the console; only its address went onchain. Anyone holding it can use exactly the scopes above
                until expiry — treat it like a password. It's shown only this once; the inventory file holds no secrets.
              </p>
            </div>

            <div className='rounded-lg border border-zinc-200 dark:border-zinc-700 p-3'>
              <p className='text-xs uppercase tracking-wider text-zinc-500 mb-2'>Use your session key</p>
              <code className='block rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs break-all whitespace-pre-wrap'>
                {`# session address: ${generated?.address ?? ""}\nSESSION_KEY=${generated ? `${generated.privateKey.slice(0, 10)}…` : ""}\nWALLET_ADDRESS=${account}`}
              </code>
              <p className='text-xs text-zinc-500 mt-2'>docs → “Using session keys”</p>
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
            <div className='flex gap-2'>
              <Button variant='ghost' size='compact' onClick={downloadInventory}>
                Download inventory (no secrets)
              </Button>
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
