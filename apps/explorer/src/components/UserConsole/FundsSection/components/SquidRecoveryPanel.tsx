import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Loader2 } from "lucide-react";
import type { SquidRecoveryPanelState } from "../hooks/useGuidedSquidAcquisition";

type SquidRecoveryPanelProps =
  | { onClearInvalid: () => void; state: Extract<SquidRecoveryPanelState, { kind: "invalid-storage" }> }
  | { state: Extract<SquidRecoveryPanelState, { kind: "storage-unavailable" }> }
  | {
      onClear: () => void;
      onContinue: () => void;
      state: Extract<SquidRecoveryPanelState, { kind: "manual-verification" }>;
    }
  | { onClear: () => void; state: Extract<SquidRecoveryPanelState, { kind: "automatic-check" }> }
  | {
      onClear: () => void;
      onRetryAutomatic: () => void;
      state: Extract<SquidRecoveryPanelState, { kind: "automatic-retryable-error" }>;
    }
  | { onClear: () => void; state: Extract<SquidRecoveryPanelState, { kind: "automatic-permanent-error" }> }
  | {
      onClear: () => void;
      onRetryDeposit: () => void;
      state: Extract<SquidRecoveryPanelState, { kind: "deposit-recovery" }>;
    };

function TransactionHashes({
  state,
}: {
  state: Extract<
    SquidRecoveryPanelState,
    { kind: "automatic-check" | "automatic-permanent-error" | "automatic-retryable-error" | "manual-verification" }
  >;
}) {
  return state.acquisition.transactionHashes.length > 0 ? (
    state.acquisition.transactionHashes.map((hash) => (
      <code className='block break-all' key={hash}>
        {hash}
      </code>
    ))
  ) : (
    <p>The wallet request may have been submitted without returning a transaction hash.</p>
  );
}

export function SquidRecoveryPanel(props: SquidRecoveryPanelProps) {
  const { state } = props;
  if (state.kind === "invalid-storage") {
    if (!("onClearInvalid" in props)) return null;
    return (
      <RecoveryShell>
        <p className='text-destructive'>
          The saved acquisition data is invalid and must be cleared before funding can continue.
        </p>
        <Button onClick={props.onClearInvalid} size='compact' type='button' variant='tertiary'>
          Clear invalid saved acquisition
        </Button>
      </RecoveryShell>
    );
  }
  if (state.kind === "storage-unavailable") {
    return (
      <RecoveryShell>
        <p className='text-destructive'>Browser storage is unavailable, so funding cannot continue safely.</p>
      </RecoveryShell>
    );
  }
  if (state.kind === "deposit-recovery") {
    if (!("onRetryDeposit" in props) || !("onClear" in props)) return null;
    return (
      <RecoveryShell>
        <p className='font-medium text-destructive'>A saved transaction needs verification.</p>
        <p>
          Check the Filecoin deposit transaction before retrying or clearing it:
          {state.acquisition.depositTransactionHash ? (
            <code className='mt-1 block break-all'>{state.acquisition.depositTransactionHash}</code>
          ) : (
            <span className='mt-1 block'>The wallet request may not have returned a transaction hash.</span>
          )}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button onClick={props.onRetryDeposit} size='compact' type='button' variant='tertiary'>
            Deposit failed, retry
          </Button>
          <Button onClick={props.onClear} size='compact' type='button' variant='tertiary'>
            Deposit completed, clear
          </Button>
        </div>
      </RecoveryShell>
    );
  }
  if (!("onClear" in props)) return null;

  return (
    <RecoveryShell>
      <p className='font-medium text-destructive'>A saved transaction needs verification.</p>
      <p>Check {state.sourceChainName ?? `chain ${state.acquisition.sourceChainId}`} for the swap.</p>
      {state.kind === "manual-verification" && state.coordinationError && (
        <p className='text-muted-foreground' role='status'>
          {state.coordinationError}
        </p>
      )}
      <TransactionHashes state={state} />
      {state.kind === "automatic-check" && (
        <p className='inline-flex items-center gap-2 text-muted-foreground' role='status'>
          {state.isFetching && <Loader2 className='h-4 w-4 animate-spin' />}
          Automatically checking the source transaction and Filecoin USDFC balance…
        </p>
      )}
      {(state.kind === "automatic-retryable-error" || state.kind === "automatic-permanent-error") && (
        <div className='grid gap-2' role='alert'>
          <p className='text-destructive'>
            Automatic recovery {state.kind === "automatic-permanent-error" ? "stopped" : "will retry"}: {state.message}
          </p>
          {state.kind === "automatic-retryable-error" && "onRetryAutomatic" in props && (
            <Button onClick={props.onRetryAutomatic} size='compact' type='button' variant='tertiary'>
              Retry automatic check now
            </Button>
          )}
        </div>
      )}
      <div className='flex flex-wrap gap-2'>
        {state.kind === "manual-verification" && "onContinue" in props && (
          <Button onClick={props.onContinue} size='compact' type='button' variant='tertiary'>
            USDFC arrived, continue to deposit
          </Button>
        )}
        <Button onClick={props.onClear} size='compact' type='button' variant='tertiary'>
          USDFC did not arrive, clear
        </Button>
      </div>
    </RecoveryShell>
  );
}

function RecoveryShell({ children }: { children: React.ReactNode }) {
  return <div className='grid gap-2 rounded-md border border-destructive/30 p-3 text-sm'>{children}</div>;
}
