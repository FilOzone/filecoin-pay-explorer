"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ArrowSquareOutIcon, KeyIcon, WalletIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Hex } from "viem";
import CopyButton from "@/components/shared/CopyButton";
import { getChain } from "@/constants/chains";
import { type SessionKeysIdentity, type SessionKeyWithStatus, useSessionKeys } from "@/hooks/useSessionKeys";
import type { Network } from "@/types";
import { formatAddress, formatDateTime } from "@/utils/formatter";
import { hasUniformExpiry, pickRevokeTarget, SCOPE_BY_ID, type ScopeId } from "@/utils/sessionKeys";
import { CreateKeyFlow } from "./CreateKeyFlow";
import { RevokeDialog } from "./RevokeDialog";

interface SessionKeysSectionProps {
  network: Network;
  /** Undefined while no wallet is connected; the section then shows a prompt instead of the list. */
  account?: Hex;
  prefillAddress?: Hex | null;
  prefillScopes?: ScopeId[] | null;
  prefillNetwork?: Network | null;
}

type ConnectedProps = SessionKeysSectionProps & { account: Hex };

const STATUS_STYLES: Record<SessionKeyWithStatus["status"], string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  unknown: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<SessionKeyWithStatus["status"], string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  unknown: "…",
};

/** Filfox shows the verified source; the configured explorer (Blockscout) is the one the rest of the console links to. */
const FILFOX_ADDRESS_URL: Record<Network, (address: string) => string> = {
  mainnet: (address) => `https://filfox.info/en/address/${address}?t=0`,
  calibration: (address) => `https://calibration.filfox.info/en/address/${address}?t=3`,
};

const SOURCE_CODE_URL = "https://github.com/FilOzone/SessionKeyRegistry";

/**
 * Session keys page content. One page: create/reveal/revoke are in-page
 * dialogs, not routes. List = local inventory (keys created in this browser);
 * status = live chain reads.
 */
const SessionKeysSection = ({ account, ...rest }: SessionKeysSectionProps) => {
  if (!account) {
    return (
      <EmptyStateCard
        titleTag='h3'
        icon={WalletIcon}
        title='Connect your wallet'
        description='Session keys belong to a wallet. Connect one to see and manage its keys.'
      />
    );
  }
  return <ConnectedSessionKeys account={account} {...rest} />;
};

const ConnectedSessionKeys = ({ network, account, prefillAddress, prefillScopes, prefillNetwork }: ConnectedProps) => {
  const { keys, addKey, removeKey, syncFromChain, refetchStatuses, statusReadsFailed, markConfirmed, registry } =
    useSessionKeys(network, account);
  const explorerUrl = getChain(network).blockExplorers?.default.url;
  const registryLinks = [
    { label: "Registry on Filfox (verified)", href: FILFOX_ADDRESS_URL[network](registry.address) },
    ...(explorerUrl ? [{ label: "Registry on Blockscout", href: `${explorerUrl}/address/${registry.address}` }] : []),
    { label: "Source code", href: SOURCE_CODE_URL },
  ];
  const [createOpen, setCreateOpen] = useState(false);
  // Only the banner's button carries the link's address and scopes into the
  // dialog; "+ New session key" always opens a plain form.
  const [createSource, setCreateSource] = useState<"link" | "manual">("manual");
  const openCreate = (source: "link" | "manual") => {
    setCreateSource(source);
    setCreateOpen(true);
  };
  // The target remembers the identity it was chosen under: a revoke is sent
  // by the connected wallet, so after a wallet or network switch the dialog
  // must not offer a signer the new wallet never authorized.
  const [revoke, setRevoke] = useState<{ target: SessionKeyWithStatus; identity: SessionKeysIdentity } | null>(null);
  const revokeTarget = pickRevokeTarget(revoke, { network, account });
  const setRevokeTarget = (target: SessionKeyWithStatus | null) =>
    setRevoke(target ? { target, identity: { network, account } } : null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Newest first; unknown createdAt (sanitize-coerced 0) sinks to the bottom.
  // Deterministic order matters once sync interleaves imported and local keys.
  const visibleKeys = (activeOnly ? keys.filter((k) => k.status === "active") : keys)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);

  // URL request (?authorize=) guards
  const isSelfAuthRequest = prefillAddress != null && prefillAddress.toLowerCase() === account.toLowerCase();
  const isNetworkMismatch = prefillAddress != null && prefillNetwork != null && prefillNetwork !== network;
  const cliPrefill = prefillAddress != null && !isSelfAuthRequest && !isNetworkMismatch ? prefillAddress : null;
  // Re-authorizing a key this browser already knows: the dialog becomes an add-scopes flow
  const existingForPrefill = cliPrefill
    ? keys.find((k) => k.sessionKeyPublic.toLowerCase() === cliPrefill.toLowerCase())
    : undefined;
  const existingKeyForPrefill = existingForPrefill
    ? {
        name: existingForPrefill.name,
        expirySec:
          existingForPrefill.status === "active" && existingForPrefill.maxExpiry > 0n
            ? existingForPrefill.maxExpiry
            : null,
      }
    : null;
  // A link for a key this list holds waits for that key's live reads: opening
  // before they resolve would offer a fresh expiry for a key that may be active.
  const prefillPending = existingForPrefill?.status === "unknown";
  const linkPrefill = createSource === "link" && !prefillPending ? cliPrefill : null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { addedCount, updatedCount, skippedUnrecognized } = await syncFromChain();
      if (addedCount === 0 && updatedCount === 0 && skippedUnrecognized === 0) {
        toast.success("Everything already up to date");
      } else {
        const parts = [];
        if (addedCount > 0) parts.push(`Imported ${addedCount} session key${addedCount === 1 ? "" : "s"}.`);
        if (updatedCount > 0) parts.push(`Updated ${updatedCount} from chain history.`);
        if (skippedUnrecognized > 0) parts.push(`Skipped ${skippedUnrecognized} with unrecognized scopes.`);
        toast.success(parts.join(" "));
      }
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : "Request failed. See console logs for more details.",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Rendered in the header and again in the empty state — keep the two in lockstep.
  const syncButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='ghost' size='compact' disabled={syncing} onClick={handleSync}>
          <span className='flex items-center gap-2'>
            {syncing ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
            {syncing ? "Syncing…" : "Sync from chain"}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs'>
        Finds session keys this wallet has already authorized onchain and adds them to this list. Read-only — nothing is
        created or changed onchain.
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className='flex flex-col gap-4'>
      {cliPrefill && (
        <div className='rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900 p-4 text-sm text-blue-900 dark:text-blue-200 flex items-start justify-between gap-4 flex-wrap'>
          <div>
            <p className='font-semibold'>
              A link is requesting authorization for <span className='font-mono break-all'>{cliPrefill}</span>
            </p>
            <p className='text-xs mt-1'>
              This page can't verify who sent this link — review before you authorize.
              {prefillScopes && prefillScopes.length > 0 && (
                <>
                  {" "}
                  Requested scopes: <b>{prefillScopes.map((id) => SCOPE_BY_ID[id].label).join(", ")}</b>.
                </>
              )}
            </p>
          </div>
          {prefillPending && statusReadsFailed ? (
            <Button variant='primary' size='compact' onClick={() => refetchStatuses()}>
              Could not read this key's status. Retry
            </Button>
          ) : (
            <Button variant='primary' size='compact' disabled={prefillPending} onClick={() => openCreate("link")}>
              {prefillPending ? "Checking key status…" : "Review & authorize"}
            </Button>
          )}
        </div>
      )}
      {isSelfAuthRequest && (
        <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200'>
          <p className='font-semibold'>Authorization request ignored: it names your connected wallet address.</p>
          <p className='text-xs mt-1'>A session key must be a separate keypair, retry with a new address.</p>
        </div>
      )}
      {isNetworkMismatch && !isSelfAuthRequest && (
        <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200'>
          <p className='font-semibold'>
            This authorization request is for <span className='capitalize'>{prefillNetwork}</span>, but your wallet is
            connected to <span className='capitalize'>{network}</span>.
          </p>
          <p className='text-xs mt-1'>
            Nothing was added — approving it here would grant the scopes on{" "}
            <span className='capitalize'>{network}</span> instead. Switch your wallet to{" "}
            <span className='capitalize'>{prefillNetwork}</span> to review the request.
          </p>
        </div>
      )}

      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <h3 className='text-2xl font-medium'>Session keys</h3>
          <p className='text-sm text-zinc-500 max-w-xl mt-1'>
            Scoped, expiring signing keys for apps and agents, like API tokens that live on chain. They can never move
            your funds. Scopes currently apply to <b>Filecoin Warm Storage</b>. Open an issue to request support for
            other services.
          </p>
          <p className='text-xs mt-1.5 flex gap-4'>
            {registryLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target='_blank'
                rel='noreferrer'
                className='text-blue-600 dark:text-blue-400 inline-flex items-center gap-1'
              >
                {link.label} <ArrowSquareOutIcon size={12} />
              </a>
            ))}
          </p>
        </div>
        <div className='flex gap-2 shrink-0 flex-wrap'>
          {syncButton}
          <Button variant='primary' size='compact' onClick={() => openCreate("manual")}>
            + New session key
          </Button>
        </div>
      </div>

      <details className='rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm'>
        <summary className='cursor-pointer font-medium'>What's a session key?</summary>
        <p className='mt-2 text-zinc-600 dark:text-zinc-400'>
          A session key is a disposable keypair you authorize to sign specific Warm Storage actions on your behalf —
          exactly the scopes you pick when creating it — until an expiry you set. You give the key to an app, a CI job,
          or an agent instead of your wallet key. It can't withdraw funds, change approvals, or do anything outside its
          scopes, and you can revoke it any time. The authorization lives on chain in the key registry; the key itself
          never leaves your hands.
        </p>
      </details>

      {keys.length === 0 ? (
        <EmptyStateCard
          titleTag='h4'
          icon={KeyIcon}
          title='No session keys yet'
          description='Create one to let an app or agent upload to your datasets without holding your wallet key.'
        >
          <div className='flex gap-2 justify-center'>
            <Button variant='primary' size='compact' onClick={() => openCreate("manual")}>
              + New session key
            </Button>
            {syncButton}
          </div>
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
                  <th className='px-4 py-3 font-semibold'>Status</th>
                  <th className='px-4 py-3' aria-label='Actions' />
                </tr>
              </thead>
              <tbody>
                {visibleKeys.map((key) => {
                  const uniformExpiry = hasUniformExpiry(key.scopes, key.scopeExpiries);
                  return (
                    <tr
                      key={key.sessionKeyPublic}
                      className='border-b border-zinc-100 dark:border-zinc-800 last:border-0'
                    >
                      <td className='px-4 py-3'>
                        {key.name ? (
                          <span className='font-medium'>{key.name}</span>
                        ) : (
                          <span className='text-zinc-500'>(unnamed)</span>
                        )}
                        {key.source === "chain" && (
                          <span className='ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 align-middle'>
                            Imported
                          </span>
                        )}
                        {key.createdAt > 0 && (
                          <span className='block text-xs text-zinc-500'>created {formatDateTime(key.createdAt)}</span>
                        )}
                      </td>
                      <td className='px-4 py-3 font-mono text-xs' title={key.sessionKeyPublic}>
                        <span className='inline-flex items-center gap-1.5'>
                          {formatAddress(key.sessionKeyPublic)}
                          <CopyButton
                            value={key.sessionKeyPublic}
                            tooltipText='Copy session key address'
                            successMessage='Session key address copied'
                          />
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        {uniformExpiry ? (
                          <div className='text-xs text-zinc-700 dark:text-zinc-300'>
                            <span className='whitespace-nowrap'>
                              {key.scopes.map((scopeId, i) => (
                                <span
                                  key={scopeId}
                                  className={clsx(
                                    key.scopeActive[scopeId] === false && "text-zinc-400 dark:text-zinc-500",
                                  )}
                                >
                                  {/* Two scopes per line: comma within a pair, line break between pairs. */}
                                  {i > 0 && (i % 2 === 0 ? <br /> : ", ")}
                                  {SCOPE_BY_ID[scopeId].label}
                                </span>
                              ))}
                            </span>
                            {/* Shared across every scope here by definition (that's what "uniform" means) — one line,
                                not repeated per scope. Expired-key case shows no date: nothing here is still granted. */}
                            {key.status === "active" && key.maxExpiry > 0n && (
                              <span className='block text-zinc-500 mt-1'>
                                until {formatDateTime(Number(key.maxExpiry) * 1000)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className='flex flex-col gap-0.5 text-xs text-zinc-700 dark:text-zinc-300'>
                            {key.scopes.map((scopeId) => {
                              const scopeExpiry = key.scopeExpiries[scopeId];
                              const scopeIsActive = key.scopeActive[scopeId] === true;
                              return (
                                <div
                                  key={scopeId}
                                  className={clsx(
                                    "flex items-baseline gap-1.5",
                                    !scopeIsActive && "text-zinc-400 dark:text-zinc-500",
                                  )}
                                >
                                  <span>{SCOPE_BY_ID[scopeId].label}</span>
                                  {scopeIsActive && scopeExpiry != null && scopeExpiry > 0n && (
                                    <span className='text-[10px] whitespace-nowrap'>
                                      until {formatDateTime(Number(scopeExpiry) * 1000)}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3'>
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            STATUS_STYLES[key.status],
                          )}
                        >
                          {STATUS_LABELS[key.status]}
                        </span>
                        {key.status === "revoked" && key.revokedAt !== undefined && (
                          <span className='block text-xs text-zinc-500 mt-1'>{formatDateTime(key.revokedAt)}</span>
                        )}
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
                  );
                })}
                {visibleKeys.length === 0 && (
                  <tr>
                    <td colSpan={5} className='px-4 py-6 text-center text-sm text-zinc-500'>
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
        This list lives in this browser; status is always read live from the chain.
      </p>

      <CreateKeyFlow
        open={createOpen}
        onOpenChange={setCreateOpen}
        network={network}
        account={account}
        registry={registry}
        explorerUrl={explorerUrl}
        prefillAddress={linkPrefill}
        prefillScopes={linkPrefill ? prefillScopes : null}
        existingKey={linkPrefill ? existingKeyForPrefill : null}
        onCreated={addKey}
        onConfirmed={markConfirmed}
        onFailed={removeKey}
      />
      <RevokeDialog
        sessionKey={revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        registry={registry}
        explorerUrl={explorerUrl}
        onRevoked={refetchStatuses}
      />
    </div>
  );
};

export default SessionKeysSection;
