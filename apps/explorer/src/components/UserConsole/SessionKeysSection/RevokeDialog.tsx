"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Abi, Hex } from "viem";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { SessionKeyWithStatus } from "@/hooks/useSessionKeys";
import { formatAddress } from "@/utils/formatter";
import { SCOPE_BY_ID } from "@/utils/sessionKeys";

interface RevokeDialogProps {
  sessionKey: SessionKeyWithStatus | null;
  onOpenChange: (open: boolean) => void;
  registry: { address: Hex; abi: Abi };
  onRevoked: () => void;
}

/**
 * Whole-key revoke: one click, one tx, all granted scopes -> expiry 0.
 *
 * In-flight revokes are tracked PER KEY: reopening the dialog for a key
 * whose revoke is still confirming shows "Revoking…", while other keys get
 * a clean dialog — several revokes can confirm concurrently, each resolving
 * its own toast and row refresh.
 */
export const RevokeDialog: React.FC<RevokeDialogProps> = ({ sessionKey, onOpenChange, registry, onRevoked }) => {
  // Lowercased addresses with a submitted, still-confirming revoke.
  const [pendingRevokes, setPendingRevokes] = useState<Set<string>>(new Set());
  // Current dialog target, readable from receipt callbacks that outlive the
  // submit-time closure (the dialog may have moved to another key since).
  const targetRef = useRef<string | null>(null);
  targetRef.current = sessionKey?.sessionKeyPublic.toLowerCase() ?? null;

  const { execute } = useContractTransaction({
    contractAddress: registry.address,
    abi: registry.abi,
  });

  const revokePending = sessionKey != null && pendingRevokes.has(sessionKey.sessionKeyPublic.toLowerCase());

  const handleRevoke = async () => {
    if (!sessionKey || revokePending) return;
    const key = sessionKey.sessionKeyPublic.toLowerCase();
    const clearPending = () =>
      setPendingRevokes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

    setPendingRevokes((prev) => new Set(prev).add(key));
    try {
      await execute({
        functionName: "revoke",
        args: [sessionKey.sessionKeyPublic, sessionKey.scopes.map((id) => SCOPE_BY_ID[id].typehash), sessionKey.name],
        metadata: { type: "revokeSessionKey", keyName: sessionKey.name },
        onConfirmed: () => {
          clearPending();
          onRevoked();
          // Auto-close only when the dialog still shows the key this receipt
          // belongs to — never yank a dialog opened for a different key.
          if (targetRef.current === key) onOpenChange(false);
        },
        onReverted: clearPending,
      });
    } catch {
      // wallet rejected / submission failed: nothing onchain, toast already shown
      clearPending();
    }
  };

  // The dialog stays closable at any time — nothing is lost by closing; a pending revoke completes onchain and toasts/status reads report it.
  return (
    <Dialog open={sessionKey !== null} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Revoke “{sessionKey?.name || "(unnamed)"}”?</DialogTitle>
          <DialogDescription>
            Immediately disables every scope of this key. Apps still holding it will stop working.
          </DialogDescription>
        </DialogHeader>

        <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200'>
          <b>This cannot be undone.</b> Once revoked, the key is dead for good. If something still needs access, create
          a new session key and give it the new secret.
        </div>

        {sessionKey && (
          <dl className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm'>
            <dt className='text-zinc-500'>Session key</dt>
            <dd className='font-mono'>{formatAddress(sessionKey.sessionKeyPublic)}</dd>
            <dt className='text-zinc-500'>Scopes revoked</dt>
            <dd>{sessionKey.scopes.map((id) => SCOPE_BY_ID[id].label).join(" · ")}</dd>
          </dl>
        )}

        <DialogFooter>
          <button
            type='button'
            disabled={revokePending}
            onClick={handleRevoke}
            className='rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5'
          >
            {revokePending ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' /> Revoking…
              </span>
            ) : (
              "Revoke key"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
