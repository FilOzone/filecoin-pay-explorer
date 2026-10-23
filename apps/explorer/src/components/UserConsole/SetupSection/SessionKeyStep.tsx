"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useState } from "react";
import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { CreateKeyFlow } from "@/components/UserConsole/SessionKeysSection/CreateKeyFlow";
import { getChain } from "@/constants/chains";
import { useSessionKeys } from "@/hooks/useSessionKeys";
import type { Network } from "@/types";
import { formatDateTime } from "@/utils/formatter";
import { DEFAULT_EXPIRY_DAYS, type ExistingKeyPrefill, existingKeyPrefill, SCOPE_BY_ID } from "@/utils/sessionKeys";
import type { SessionKeyRequest } from "@/utils/setupLink";
import { type KeyGrant, keyGrant, SETUP_POLL_MS } from "./data/setupStatus";
import { SetupStep, type StepTone } from "./SetupStep";

const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

/** A link naming the connected wallet itself, which can never be its own session key. */
const isOwnWallet = (key: Hex, account: Hex) => key.toLowerCase() === account.toLowerCase();

/** Once every scope is granted there is nothing left to wait for, so the poll only watches for a revoke or expiry. */
const AUTHORIZED_POLL_MS = 60_000;

/**
 * The registry's live answer for each scope the link requests, polled so a
 * grant sent elsewhere shows up too. Not read for the wallet's own address,
 * which can never be authorized.
 */
export function useKeyGrant(network: Network, account: Hex, request: SessionKeyRequest | null) {
  const chain = getChain(network);
  const registry = chain.contracts.sessionKeyRegistry;
  const isSelf = request !== null && isOwnWallet(request.address, account);
  const scopes = request?.scopes ?? [];
  const { data, dataUpdatedAt, refetch } = useReadContracts({
    contracts: request
      ? request.scopes.map((scopeId) => ({
          address: registry.address,
          abi: registry.abi,
          functionName: "authorizationExpiry" as const,
          args: [account, request.address, SCOPE_BY_ID[scopeId].typehash] as const,
          chainId: chain.id,
        }))
      : [],
    query: {
      enabled: request !== null && !isSelf,
      refetchInterval: (query) =>
        keyGrant(scopes, query.state.data, nowSec()).state === "authorized" ? AUTHORIZED_POLL_MS : SETUP_POLL_MS,
    },
  });
  if (!request || isSelf) return { grant: { state: "none" } as KeyGrant, refetch };
  // Measured at the last read, so a grant that expires while the page is open stops counting at the next poll.
  return { grant: keyGrant(request.scopes, data, BigInt(Math.floor(dataUpdatedAt / 1000))), refetch };
}

const GRANT_STATUS: Record<KeyGrant["state"], StepTone> = {
  loading: "waiting",
  unreadable: "problem",
  none: "todo",
  partial: "problem",
  authorized: "done",
};

function grantLabel(grant: KeyGrant) {
  switch (grant.state) {
    case "loading":
      return "Checking";
    case "unreadable":
      return "Could not read its status";
    case "none":
      return "Not authorized";
    case "partial":
      return "Partly authorized";
    case "authorized":
      return `Authorized until ${formatDateTime(Number(grant.expiresAt) * 1000)}`;
  }
}

/**
 * What the dialog will sign: an active key this browser lists keeps its
 * expiry, which the dialog does not offer to change; a new one lasts the
 * link's days, which it does.
 */
function expiryText(existing: ExistingKeyPrefill | null, days: number) {
  if (existing?.expirySec != null)
    return `Keeps its current expiry, ${formatDateTime(Number(existing.expirySec) * 1000)}`;
  return `After ${days} ${days === 1 ? "day" : "days"}, unless you change it`;
}

const Detail = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className='grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-4'>
    <dt className='text-muted-foreground'>{term}</dt>
    <dd className='min-w-0 text-foreground'>{children}</dd>
  </div>
);

interface SessionKeyStepProps {
  number: number;
  network: Network;
  account: Hex;
  request: SessionKeyRequest;
  grant: KeyGrant;
  onGranted: () => void;
}

/**
 * Authorize the key the link names. The New session key dialog does the
 * signing: it opens with the link's address, scopes, name and days, and the
 * owner can still narrow the scopes or change the name and expiry.
 */
export const SessionKeyStep = ({ number, network, account, request, grant, onGranted }: SessionKeyStepProps) => {
  const [open, setOpen] = useState(false);
  const { keys, addKey, removeKey, refetchStatuses, statusReadsPending, markConfirmed, registry } = useSessionKeys(
    network,
    account,
  );
  const explorerUrl = getChain(network).blockExplorers?.default.url;
  const isSelf = isOwnWallet(request.address, account);
  // A key this browser already lists opens as an add-scopes or renewal form, which needs its
  // live reads first: opening before they resolve would offer a fresh expiry for a key that may be active.
  const listed = keys.find((key) => key.sessionKeyPublic.toLowerCase() === request.address.toLowerCase());
  const listedPending = listed?.status === "unknown";
  const listedUnreadable = listedPending && !statusReadsPending;
  const existing = existingKeyPrefill(listed);

  const action = (() => {
    if (isSelf || grant.state === "authorized") return null;
    if (listedUnreadable) {
      return (
        <Button variant='ghost' size='compact' onClick={() => refetchStatuses()}>
          Could not read this key's status. Retry
        </Button>
      );
    }
    return (
      <Button variant='primary' size='compact' disabled={listedPending} onClick={() => setOpen(true)}>
        {listedPending ? "Checking key status…" : "Review and authorize"}
      </Button>
    );
  })();

  return (
    <SetupStep
      number={number}
      title='Authorize a session key'
      description='Lets the tool sign storage actions for this wallet until it expires. It can never move your funds, and you can revoke it from Session keys.'
      status={{ tone: GRANT_STATUS[grant.state], label: grantLabel(grant) }}
    >
      <dl className='divide-y rounded-lg border px-4 text-sm'>
        <Detail term='Session key'>
          <span className='inline-flex max-w-full items-start gap-1.5'>
            <span className='font-mono text-xs break-all leading-5'>{request.address}</span>
            <CopyButton
              value={request.address}
              tooltipText='Copy session key address'
              successMessage='Address copied'
            />
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            Check it matches the address your terminal printed.
          </span>
        </Detail>
        {request.name && <Detail term='Name'>{request.name}</Detail>}
        <Detail term='Scopes'>
          <ul className='flex flex-col gap-0.5'>
            {request.scopes.map((id) => (
              <li key={id}>
                {SCOPE_BY_ID[id].label}
                {/* The badge the New session key dialog puts on the same scopes. */}
                {SCOPE_BY_ID[id].destructive && (
                  <span className='ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'>
                    destructive
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Detail>
        <Detail term='Expiration'>{expiryText(existing, request.days ?? DEFAULT_EXPIRY_DAYS)}</Detail>
      </dl>
      {isSelf ? (
        <Notice tone='error' role='alert' title='This is your wallet address' className='mt-4'>
          <p className='text-xs mt-1'>A session key must be a separate address. Run the command again for a new key.</p>
        </Notice>
      ) : (
        action && <div className='mt-4'>{action}</div>
      )}

      <CreateKeyFlow
        open={open}
        onOpenChange={setOpen}
        network={network}
        account={account}
        registry={registry}
        explorerUrl={explorerUrl}
        prefillAddress={request.address}
        prefillScopes={request.scopes}
        prefillName={request.name}
        prefillDays={request.days}
        existingKey={existing}
        onCreated={addKey}
        onConfirmed={(signer) => {
          markConfirmed(signer);
          onGranted();
        }}
        onFailed={removeKey}
      />
    </SetupStep>
  );
};
