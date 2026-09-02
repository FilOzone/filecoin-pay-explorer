"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useAccount } from "wagmi";

/**
 * Review-before-signing for embedded wallets.
 *
 * Embedded wallets sign silently (`showWalletUIs: false` — see
 * ConsoleProviders), so the console owns the consent surface. This dialog
 * shows what an action will sign, in human terms, before any signature is
 * requested. It reviews once per user action (a deposit is one review even
 * though it involves a permit signature and a transaction), and only for
 * embedded-wallet signers: external wallets already confirm through their
 * own popups.
 *
 * The preference is per device. Default is ON; the dialog's "don't ask
 * again" checkbox turns it off, and the wallet dropdown can turn it back on.
 */

const STORAGE_KEY = "filecoin-pay:review-before-signing:v1";

export function isReviewEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setReviewEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
}

/** True when the active wagmi connector is a Privy embedded wallet. */
export function useIsEmbeddedSigner(): boolean {
  const { connector } = useAccount();
  return connector?.id?.startsWith("io.privy.wallet") ?? false;
}

export interface ReviewRequest {
  /** Short verb phrase, e.g. "Deposit 5 USDFC" */
  title: string;
  /** Label/value rows shown to the user, most important first. */
  rows: { label: string; value: string }[];
  /** Raw technical payload for the expander, already stringified. */
  details: string;
}

export function useTransactionReview() {
  const isEmbeddedSigner = useIsEmbeddedSigner();
  const [request, setRequest] = useState<ReviewRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  /**
   * Resolves true when the user confirms (or no review is needed),
   * false when they cancel.
   */
  const requestReview = useCallback(
    (req: ReviewRequest): Promise<boolean> => {
      if (!isEmbeddedSigner || !isReviewEnabled()) return Promise.resolve(true);
      const { promise, resolve } = Promise.withResolvers<boolean>();
      resolverRef.current = resolve;
      setRequest(req);
      return promise;
    },
    [isEmbeddedSigner],
  );

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const reviewDialog = request ? <TransactionReviewDialog request={request} onSettle={settle} /> : null;

  return { requestReview, reviewDialog };
}

const TransactionReviewDialog = ({
  request,
  onSettle,
}: {
  request: ReviewRequest;
  onSettle: (confirmed: boolean) => void;
}) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const confirm = () => {
    if (dontAskAgain) setReviewEnabled(false);
    onSettle(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onSettle(false)}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ShieldCheck className='size-5 text-green-600' />
            Review before signing
          </DialogTitle>
          <DialogDescription>
            Your wallet signs this without any further prompt. Check the details, then confirm.
          </DialogDescription>
        </DialogHeader>

        <div className='rounded-md border divide-y text-sm'>
          <div className='px-3 py-2 font-semibold'>{request.title}</div>
          {request.rows.map((row) => (
            <div key={row.label} className='flex items-start justify-between gap-4 px-3 py-2'>
              <span className='text-zinc-500 shrink-0'>{row.label}</span>
              <span className='font-mono text-right break-all'>{row.value}</span>
            </div>
          ))}
        </div>

        <button
          type='button'
          onClick={() => setShowDetails((s) => !s)}
          className='flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 w-fit'
        >
          <ChevronDown className={`size-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          Technical details
        </button>
        {showDetails ? (
          <pre className='max-h-40 overflow-auto rounded-md bg-zinc-50 border p-2 text-[11px] leading-snug whitespace-pre-wrap break-all'>
            {request.details}
          </pre>
        ) : null}

        <label className='flex items-center gap-2 text-sm text-zinc-600 cursor-pointer'>
          <input
            type='checkbox'
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className='size-4'
          />
          Don't ask again on this device
        </label>

        <DialogFooter>
          <Button variant='ghost' size='sm' onClick={() => onSettle(false)}>
            Cancel
          </Button>
          <Button variant='default' size='sm' onClick={confirm}>
            Confirm and sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
