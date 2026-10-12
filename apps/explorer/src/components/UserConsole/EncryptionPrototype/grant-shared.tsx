"use client";
// PROTOTYPE, throwaway. Shared in-memory store, labels and the grant result block.
import { useState } from "react";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { type Grant, type Keyspace, type Role, type Seed, type SeedState, type SessionKey, seedFor } from "./mock-data";

export const BROWSER_ONLY = "Keyspace labels, role names and grant history are saved in this browser only.";
export const NO_REVOKE = "Grants can't be revoked.";

export const shortKey = (k: string) => `${k.slice(0, 6)}…${k.slice(-4)}`;

/** Display fields for a grant's recipient. Alias: local override, then session key label, then the grant's own label. */
export function grantRecipient(sks: SessionKey[], g: Grant, aliases: Record<string, string>) {
  const sk = sks.find(
    (s) =>
      (g.recipientAddress && s.address === g.recipientAddress) ||
      (g.recipientPublicKey && s.publicKey === g.recipientPublicKey),
  );
  return {
    alias: aliases[g.recipientPublicKey] || sk?.label || g.recipientLabel || "Unnamed recipient",
    address: sk?.address || g.recipientAddress,
    key: g.recipientPublicKey,
  };
}

export function useStore(state: SeedState) {
  const [s, set] = useState<Seed>(() => seedFor(state));
  const [aliases, setAliases] = useState<Record<string, string>>({});
  return {
    ...s,
    aliases,
    setAlias: (key: string, alias: string) =>
      setAliases((a) => {
        const { [key]: _drop, ...rest } = a;
        return alias ? { ...rest, [key]: alias } : rest;
      }),
    rename: (id: string, label: string) =>
      set((p) => ({ ...p, keyspaces: p.keyspaces.map((k) => (k.id === id ? { ...k, label } : k)) })),
    addKeyspace: (ks: Keyspace) => set((p) => ({ ...p, keyspaces: [...p.keyspaces, ks] })),
    commit: (ks: Keyspace | null, role: Role | null, grant: Grant) =>
      set((p) => ({
        ...p,
        keyspaces: ks ? [...p.keyspaces, ks] : p.keyspaces,
        roles: role ? [...p.roles, role] : p.roles,
        grants: [...p.grants, grant],
      })),
  };
}
export type Store = ReturnType<typeof useStore>;

export type Scope = { keyspaceId?: string; roleOrKeyspace?: "keyspace" | `role:${string}`; recipient?: string };

export function ResultBlock({ blob }: { blob: string }) {
  const cmd = `filecoin-pin grant import ${blob}`;
  return (
    <div className='space-y-2'>
      <Notice tone='ok' title='Grant issued'>
        Run this on the session key's machine.
      </Notice>
      <div className='flex items-start gap-2 rounded-md border bg-muted p-2'>
        <code className='min-w-0 flex-1 break-all text-xs'>{cmd}</code>
        <CopyButton value={cmd} />
      </div>
      <p className='text-xs text-muted-foreground'>
        The grant is useless without the session key's private key, so it's safe to paste into a chat or an agent.
      </p>
    </div>
  );
}

export const dataText = (k: Keyspace) =>
  k.onChain ? `${k.onChain.dataSetIds.length} data set${k.onChain.dataSetIds.length === 1 ? "" : "s"}` : "No data yet";

export function BrowserOnlyNotice({ state }: { state: SeedState }) {
  return state === "fresh-browser" ? (
    <Notice tone='warn' title='New browser'>
      {BROWSER_ONLY} Keyspaces were found on the chain, but their labels, roles and grants aren't here.
    </Notice>
  ) : (
    <p className='text-xs text-muted-foreground'>{BROWSER_ONLY}</p>
  );
}
