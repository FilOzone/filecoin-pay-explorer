"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ArrowSquareOutIcon, KeyIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Hex } from "viem";
import { type SessionKeyWithStatus, useSessionKeys } from "@/hooks/useSessionKeys";
import type { Network } from "@/types";
import { formatAddress } from "@/utils/formatter";
import { SCOPE_BY_ID } from "@/utils/sessionKeys";
import { CreateKeyFlow } from "./CreateKeyFlow";
import { download } from "./download";
import { RevokeDialog } from "./RevokeDialog";

interface SessionKeysSectionProps {
  network: Network;
  account: Hex;
  /** Validated `?authorize=` address from the filecoin-pin CLI pairing flow (already checksummed or null). */
  prefillAddress?: Hex | null;
}

const STATUS_STYLES: Record<SessionKeyWithStatus["status"], string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  notFound: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  unknown: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<SessionKeyWithStatus["status"], string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  notFound: "Not Found",
  unknown: "…",
};

const REGISTRY_EXPLORER_URL: Record<Network, (address: string) => string> = {
  mainnet: (address) => `https://filfox.info/en/address/${address}?t=0`,
  calibration: (address) => `https://calibration.filfox.info/en/address/${address}?t=3`,
};

const SOURCE_CODE_URL = "https://github.com/FilOzone/SessionKeyRegistry";

/**
 * Session keys page content. One page: create/reveal/revoke are in-page
 * dialogs, not routes. List = local inventory (created here, file imports,
 * chain scans); status = live chain reads.
 */
const SessionKeysSection = ({ network, account, prefillAddress }: SessionKeysSectionProps) => {
  const {
    keys,
    addKey,
    removeKey,
    exportInventory,
    importInventory,
    importFromChain,
    isScanning,
    refetchStatuses,
    registry,
  } = useSessionKeys(network, account);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SessionKeyWithStatus | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleKeys = activeOnly ? keys.filter((k) => k.status === "active") : keys;

  // CLI pairing request (?authorize=). Requesting the connected wallet's own
  // address as a session key is always a mistake — the whole point is a
  // separate, scoped keypair — so that case warns and never prefills.
  const isSelfAuthRequest = prefillAddress != null && prefillAddress.toLowerCase() === account.toLowerCase();
  const cliPrefill = prefillAddress != null && !isSelfAuthRequest ? prefillAddress : null;

  const handleExport = () =>
    download(`filecoin-pay-session-keys-${network}.json`, exportInventory(), "application/json");

  const handleImportFile = async (file: File) => {
    try {
      const added = importInventory(await file.text());
      toast.success(added > 0 ? `Imported ${added} key${added === 1 ? "" : "s"}` : "No new keys in this file", {
        description: added > 0 ? "Statuses are being read from the chain." : undefined,
      });
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : "Invalid inventory file." });
    }
  };

  const handleImportFromChain = async () => {
    try {
      const added = await importFromChain();
      toast.success(added > 0 ? `Found ${added} key${added === 1 ? "" : "s"} onchain` : "No new keys found onchain", {
        description:
          added > 0
            ? "Names and dates recovered from the authorization events."
            : "Every onchain key is already in your list.",
      });
    } catch (err) {
      toast.error("Chain scan failed", {
        description: err instanceof Error ? err.message : "Log scan RPC unavailable.",
      });
    }
  };

  const formatExpiry = (key: SessionKeyWithStatus) => {
    if (key.status === "revoked" || key.status === "notFound") return "—";
    if (key.maxExpiry === 0n) return "…";
    return new Date(Number(key.maxExpiry) * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className='flex flex-col gap-4'>
      {cliPrefill && (
        <div className='rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900 p-4 text-sm text-blue-900 dark:text-blue-200 flex items-start justify-between gap-4 flex-wrap'>
          <div>
            <p className='font-semibold'>
              Authorization requested by filecoin-pin CLI for <span className='font-mono break-all'>{cliPrefill}</span>
            </p>
            <p className='text-xs mt-1'>Only approve if this matches the address your CLI printed.</p>
          </div>
          <Button variant='primary' size='compact' onClick={() => setCreateOpen(true)}>
            Review &amp; authorize
          </Button>
        </div>
      )}
      {isSelfAuthRequest && (
        <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200'>
          <p className='font-semibold'>Authorization request ignored: it names your connected wallet address.</p>
          <p className='text-xs mt-1'>
            A session key must be a separate keypair — nothing was prefilled. Re-run the CLI pairing and check the
            session address it prints.
          </p>
        </div>
      )}

      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <h3 className='text-2xl font-medium'>Session keys</h3>
          <p className='text-sm text-zinc-500 max-w-xl mt-1'>
            Scoped, expiring signing keys for apps and agents — like API tokens, but onchain. They can never move your
            funds.
          </p>
          <p className='text-xs mt-1.5 flex gap-4'>
            <a
              href={REGISTRY_EXPLORER_URL[network](registry.address)}
              target='_blank'
              rel='noreferrer'
              className='text-blue-600 dark:text-blue-400 inline-flex items-center gap-1'
            >
              Registry contract (verified) <ArrowSquareOutIcon size={12} />
            </a>
            <a
              href={SOURCE_CODE_URL}
              target='_blank'
              rel='noreferrer'
              className='text-blue-600 dark:text-blue-400 inline-flex items-center gap-1'
            >
              Source code <ArrowSquareOutIcon size={12} />
            </a>
          </p>
        </div>
        <div className='flex gap-2 shrink-0 flex-wrap'>
          <Button variant='ghost' size='compact' onClick={() => fileInputRef.current?.click()}>
            Import file
          </Button>
          <Button variant='ghost' size='compact' onClick={handleImportFromChain} disabled={isScanning}>
            {isScanning ? "Scanning chain…" : "Import from chain"}
          </Button>
          <Button variant='ghost' size='compact' onClick={handleExport} disabled={keys.length === 0}>
            Export inventory
          </Button>
          <Button variant='primary' size='compact' onClick={() => setCreateOpen(true)}>
            + New session key
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type='file'
        accept='application/json'
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = "";
        }}
      />

      <details className='rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm'>
        <summary className='cursor-pointer font-medium'>What's a session key?</summary>
        <p className='mt-2 text-zinc-600 dark:text-zinc-400'>
          A session key is a disposable keypair you authorize to sign a few specific Warm Storage actions on your behalf
          (here: creating datasets and adding pieces), until an expiry you set. You give the key to an app, a CI job, or
          an agent instead of your wallet key. It can't withdraw funds, change approvals, or do anything outside its
          scopes — and you can revoke it any time. The authorization lives onchain in the SessionKeyRegistry; the key
          itself never leaves your hands.
        </p>
      </details>

      {keys.length === 0 ? (
        <EmptyStateCard
          titleTag='h4'
          icon={KeyIcon}
          title='No session keys yet'
          description='Create one to let an app or agent upload to your datasets without holding your wallet key — or import a key inventory file from another device.'
        >
          <Button variant='primary' size='compact' onClick={() => setCreateOpen(true)}>
            + New session key
          </Button>
        </EmptyStateCard>
      ) : (
        <>
          <label className='flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer self-start'>
            <input type='checkbox' checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <div className='overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-zinc-200 dark:border-zinc-700 text-left text-xs uppercase tracking-wider text-zinc-500'>
                  <th className='px-4 py-3 font-semibold'>Name</th>
                  <th className='px-4 py-3 font-semibold'>Session key</th>
                  <th className='px-4 py-3 font-semibold'>Scopes</th>
                  <th className='px-4 py-3 font-semibold'>Expires</th>
                  <th className='px-4 py-3 font-semibold'>Status</th>
                  <th className='px-4 py-3' aria-label='Actions' />
                </tr>
              </thead>
              <tbody>
                {visibleKeys.map((key) => (
                  <tr
                    key={key.sessionKeyPublic}
                    className='border-b border-zinc-100 dark:border-zinc-800 last:border-0'
                  >
                    <td className='px-4 py-3'>
                      <span className='font-medium'>{key.name}</span>
                      {key.source !== "created" && (
                        <span className='ml-2 rounded-sm bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500'>
                          Imported
                        </span>
                      )}
                      <span className='block text-xs text-zinc-500'>
                        created{" "}
                        {new Date(key.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </td>
                    <td className='px-4 py-3 font-mono text-xs' title={key.sessionKeyPublic}>
                      {formatAddress(key.sessionKeyPublic)}
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex gap-1.5 flex-wrap'>
                        {key.scopes.map((scopeId) => (
                          <span
                            key={scopeId}
                            className={clsx(
                              "rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                              key.scopeActive[scopeId] === false
                                ? "border-zinc-200 text-zinc-400 dark:border-zinc-700"
                                : "border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300",
                            )}
                          >
                            {SCOPE_BY_ID[scopeId].label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className='px-4 py-3'>{formatExpiry(key)}</td>
                    <td className='px-4 py-3'>
                      <span
                        className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLES[key.status])}
                      >
                        {STATUS_LABELS[key.status]}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-right'>
                      {key.status === "active" && (
                        <button
                          type='button'
                          onClick={() => setRevokeTarget(key)}
                          className='rounded-full border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 text-xs font-medium px-3 py-1'
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleKeys.length === 0 && (
                  <tr>
                    <td colSpan={6} className='px-4 py-6 text-center text-sm text-zinc-500'>
                      No active session keys.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className='text-xs text-zinc-500'>
        This list lives in this browser (plus file and chain imports); status is always read live from the chain. The
        inventory file holds only public info — never the session key's secret.
      </p>

      <CreateKeyFlow
        open={createOpen}
        onOpenChange={setCreateOpen}
        network={network}
        account={account}
        registry={registry}
        prefillAddress={cliPrefill}
        onCreated={addKey}
        onConfirmed={refetchStatuses}
        onFailed={removeKey}
      />
      <RevokeDialog
        sessionKey={revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        registry={registry}
        onRevoked={refetchStatuses}
      />
    </div>
  );
};

export default SessionKeysSection;
