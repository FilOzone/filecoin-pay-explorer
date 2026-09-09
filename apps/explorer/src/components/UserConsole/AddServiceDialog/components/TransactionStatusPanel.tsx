import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Hash } from "viem";
import ExplorerLink from "@/components/shared/ExplorerLink";
import type { TransactionLifecycleStage } from "@/hooks/useIndexedTransaction";

export interface TransactionStatusPanelProps {
  /** The review stage is rendered by the form. */
  stage: Exclude<TransactionLifecycleStage, "review">;
  error: Error | undefined;
  /** Receipt lookup failed, but the transaction may still succeed. */
  watchError: Error | undefined;
  /** Recovery state could not be saved. */
  persistenceWarning: Error | undefined;
  /** Post-indexing refresh failed and can be retried. */
  syncError: Error | undefined;
  txHash: Hash | undefined;
  explorerUrl: string | undefined;
  indexingTimedOut: boolean;
  onRecheckReceipt: () => void;
  onRecheckIndexing: () => void;
}

function TxLink({ txHash, explorerUrl }: { txHash: Hash | undefined; explorerUrl: string | undefined }) {
  if (!txHash) return null;
  return <ExplorerLink address={txHash} explorerUrl={explorerUrl} pinned kind='tx' label='Transaction' />;
}

/** Warns that refreshing may lose transaction tracking. */
function PersistenceWarningNote({
  txHash,
  explorerUrl,
}: {
  txHash: Hash | undefined;
  explorerUrl: string | undefined;
}) {
  return (
    <p className='flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-left text-xs text-amber-700 dark:text-amber-400'>
      <AlertTriangle className='h-4 w-4 shrink-0' />
      <span>
        Transaction submitted, but recovery could not be saved. Keep this transaction hash before closing:{" "}
        <TxLink txHash={txHash} explorerUrl={explorerUrl} />
      </span>
    </p>
  );
}

/** The skeleton every stage renders: a centered icon, a bold title, a muted description, and optional extras below. */
function StatusLayout({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className='flex flex-col items-center gap-3 py-8 text-center'>
      {icon}
      <div className='space-y-1'>
        <p className='font-medium'>{title}</p>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      {children}
    </div>
  );
}

const spinner = <Loader2 className='h-10 w-10 animate-spin text-primary' />;

/** The one stage with more than two possible messages — named out per the no-nested-ternary rule. */
function getIndexingMessage(syncError: Error | undefined, indexingTimedOut: boolean): string {
  if (syncError) {
    return "Confirmed and indexed — but refreshing your account view didn't go through. Nothing further to sign; this just needs a retry.";
  }
  if (indexingTimedOut) {
    return "Your transaction is confirmed. Filecoin Pay is still indexing it — it's safe to close this dialog; we'll pick up where we left off when you return.";
  }
  return "Confirmed on-chain — waiting for it to appear in your account. This is usually quick.";
}

export const TransactionStatusPanel: React.FC<TransactionStatusPanelProps> = ({
  stage,
  error,
  watchError,
  persistenceWarning,
  syncError,
  txHash,
  explorerUrl,
  indexingTimedOut,
  onRecheckReceipt,
  onRecheckIndexing,
}) => {
  if (stage === "failed") {
    return (
      <StatusLayout
        icon={<AlertCircle className='h-10 w-10 text-destructive' />}
        title="This didn't go through"
        description={error?.message ?? "Something went wrong sending this transaction."}
      >
        <TxLink txHash={txHash} explorerUrl={explorerUrl} />
      </StatusLayout>
    );
  }

  if (stage === "complete") {
    return (
      <StatusLayout
        icon={<CheckCircle2 className='h-10 w-10 text-green-600 dark:text-green-400' />}
        title='Service added'
        description='Your account now shows this service.'
      />
    );
  }

  if (stage === "waiting-for-indexer") {
    return (
      <StatusLayout icon={spinner} title='Finishing up' description={getIndexingMessage(syncError, indexingTimedOut)}>
        <TxLink txHash={txHash} explorerUrl={explorerUrl} />
        {(syncError || indexingTimedOut) && (
          <Button type='button' variant='ghost' size='compact' onClick={onRecheckIndexing}>
            {syncError ? "Try again" : "Check now"}
          </Button>
        )}
        {persistenceWarning && <PersistenceWarningNote txHash={txHash} explorerUrl={explorerUrl} />}
      </StatusLayout>
    );
  }

  if (stage === "awaiting-signature") {
    return (
      <StatusLayout
        icon={spinner}
        title='Confirm in your wallet'
        description='Approve the request in your wallet to continue.'
      />
    );
  }

  if (stage === "confirmed") {
    return (
      <StatusLayout icon={spinner} title='Confirmed on-chain' description='Preparing to check indexing.'>
        <TxLink txHash={txHash} explorerUrl={explorerUrl} />
        {persistenceWarning && <PersistenceWarningNote txHash={txHash} explorerUrl={explorerUrl} />}
      </StatusLayout>
    );
  }

  // Receipt lookup errors remain recoverable while the transaction is submitted.
  return (
    <StatusLayout
      icon={spinner}
      title='Transaction submitted'
      description={
        watchError
          ? "Couldn't check on this transaction — it may still go through. We'll keep watching."
          : "Waiting for confirmation."
      }
    >
      <TxLink txHash={txHash} explorerUrl={explorerUrl} />
      {watchError && (
        <Button type='button' variant='ghost' size='compact' onClick={onRecheckReceipt}>
          Check again
        </Button>
      )}
      {persistenceWarning && <PersistenceWarningNote txHash={txHash} explorerUrl={explorerUrl} />}
    </StatusLayout>
  );
};
