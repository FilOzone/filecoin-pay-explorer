"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ArrowSquareOutIcon, KeyIcon, WalletIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useState } from "react";
import type { Hex } from "viem";
import { type SessionKeyWithStatus, useSessionKeys } from "@/hooks/useSessionKeys";
import type { Network } from "@/types";
import { formatAddress } from "@/utils/formatter";
import { SCOPE_BY_ID } from "@/utils/sessionKeys";
import { CreateKeyFlow } from "./CreateKeyFlow";
import { RevokeDialog } from "./RevokeDialog";

interface SessionKeysSectionProps {
  network: Network;
  /** Undefined while no wallet is connected; the section then shows a prompt instead of the list. */
  account?: Hex;
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

const REGISTRY_EXPLORER_URL: Record<Network, (address: string) => string> = {
  mainnet: (address) => `https://filfox.info/en/address/${address}?t=0`,
  calibration: (address) => `https://calibration.filfox.info/en/address/${address}?t=3`,
};

const SOURCE_CODE_URL = "https://github.com/FilOzone/SessionKeyRegistry";

/**
 * Session keys page content. One page: create/reveal/revoke are in-page
 * dialogs, not routes. List = local inventory (keys created in this browser);
 * status = live chain reads.
 */
const SessionKeysSection = ({ network, account }: SessionKeysSectionProps) => {
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
  return <ConnectedSessionKeys network={network} account={account} />;
};

const ConnectedSessionKeys = ({ network, account }: ConnectedProps) => {
  const { keys, addKey, removeKey, refetchStatuses, registry } = useSessionKeys(network, account);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SessionKeyWithStatus | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const visibleKeys = activeOnly ? keys.filter((k) => k.status === "active") : keys;

  const formatExpiry = (key: SessionKeyWithStatus) => {
    if (key.status === "revoked") return "—";
    if (key.maxExpiry === 0n) return "…";
    return new Date(Number(key.maxExpiry) * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <h3 className='text-2xl font-medium'>Session keys</h3>
          <p className='text-sm text-zinc-500 max-w-xl mt-1'>
            Scoped, expiring signing keys for apps and agents — like API tokens, but onchain. They can never move your
            funds. Scopes currently apply to <b>Filecoin Warm Storage (FWSS)</b>. Open an issue to request support for
            other services.
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
          <Button variant='primary' size='compact' onClick={() => setCreateOpen(true)}>
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
          scopes — and you can revoke it any time. The authorization lives onchain in the SessionKeyRegistry; the key
          itself never leaves your hands.
        </p>
      </details>

      {keys.length === 0 ? (
        <EmptyStateCard
          titleTag='h4'
          icon={KeyIcon}
          title='No session keys yet'
          description='Create one to let an app or agent upload to your datasets without holding your wallet key.'
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
                      {key.createdAt > 0 && (
                        <span className='block text-xs text-zinc-500'>
                          created{" "}
                          {new Date(key.createdAt).toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </td>
                    <td className='px-4 py-3 font-mono text-xs' title={key.sessionKeyPublic}>
                      {formatAddress(key.sessionKeyPublic)}
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-xs text-zinc-700 dark:text-zinc-300'>
                        {key.scopes.map((scopeId, i) => (
                          <span
                            key={scopeId}
                            className={clsx(key.scopeActive[scopeId] === false && "text-zinc-400 dark:text-zinc-500")}
                          >
                            {i > 0 && ", "}
                            {SCOPE_BY_ID[scopeId].label}
                          </span>
                        ))}
                      </span>
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
        This list lives in this browser; status is always read live from the chain.
      </p>

      <CreateKeyFlow
        open={createOpen}
        onOpenChange={setCreateOpen}
        account={account}
        registry={registry}
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
