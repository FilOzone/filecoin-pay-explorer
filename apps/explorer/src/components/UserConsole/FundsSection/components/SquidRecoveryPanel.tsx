import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Loader2 } from "lucide-react";
import type { SquidAcquisition } from "../data/squid-acquisition";

export function SquidRecoveryPanel({
  acquisition,
  automaticError,
  coordinationError,
  hasInvalidAcquisition,
  isAutomaticEligible,
  isAutomaticFetching,
  isAutomaticPermanentError,
  onClear,
  onClearInvalid,
  onContinue,
  onRetryAutomatic,
  onRetryDeposit,
  recoveryError,
  sourceChainName,
}: {
  acquisition: SquidAcquisition | null;
  automaticError: Error | null;
  coordinationError: string | null;
  hasInvalidAcquisition: boolean;
  isAutomaticEligible: boolean;
  isAutomaticFetching: boolean;
  isAutomaticPermanentError: boolean;
  onClear: () => void;
  onClearInvalid: () => void;
  onContinue: () => void;
  onRetryAutomatic: () => void;
  onRetryDeposit: () => void;
  recoveryError: string | null;
  sourceChainName?: string;
}) {
  return (
    <div className='grid gap-2 rounded-md border border-destructive/30 p-3 text-sm'>
      {acquisition ? (
        <>
          <p className='font-medium text-destructive'>A saved transaction needs verification.</p>
          {acquisition.status === "depositing" ? (
            <p>
              Check the Filecoin deposit transaction before retrying or clearing it:
              {acquisition.depositTransactionHash ? (
                <code className='mt-1 block break-all'>{acquisition.depositTransactionHash}</code>
              ) : (
                <span className='mt-1 block'>The wallet request may not have returned a transaction hash.</span>
              )}
            </p>
          ) : (
            <>
              <p>Check {sourceChainName ?? `chain ${acquisition.sourceChainId}`} for the swap.</p>
              {coordinationError && (
                <p className='text-muted-foreground' role='status'>
                  {coordinationError}
                </p>
              )}
              {acquisition.transactionHashes.map((hash) => (
                <code className='block break-all' key={hash}>
                  {hash}
                </code>
              ))}
              {acquisition.transactionHashes.length === 0 && (
                <p>The wallet request may have been submitted without returning a transaction hash.</p>
              )}
              {isAutomaticEligible && !automaticError && !recoveryError && (
                <p className='inline-flex items-center gap-2 text-muted-foreground' role='status'>
                  {isAutomaticFetching && <Loader2 className='h-4 w-4 animate-spin' />}
                  Automatically checking the source transaction and Filecoin USDFC balance…
                </p>
              )}
              {isAutomaticEligible && (automaticError || recoveryError) && (
                <div className='grid gap-2' role='alert'>
                  <p className='text-destructive'>
                    Automatic recovery {isAutomaticPermanentError ? "stopped" : "will retry"}:{" "}
                    {recoveryError || automaticError?.message}
                  </p>
                  {!isAutomaticPermanentError && (
                    <Button onClick={onRetryAutomatic} size='compact' type='button' variant='tertiary'>
                      Retry automatic check now
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          <div className='flex flex-wrap gap-2'>
            {acquisition.status === "processing" && !isAutomaticEligible && (
              <Button onClick={onContinue} size='compact' type='button' variant='tertiary'>
                USDFC arrived, continue to deposit
              </Button>
            )}
            {acquisition.status === "depositing" && (
              <Button onClick={onRetryDeposit} size='compact' type='button' variant='tertiary'>
                Deposit failed, retry
              </Button>
            )}
            <Button onClick={onClear} size='compact' type='button' variant='tertiary'>
              {acquisition.status === "depositing" ? "Deposit completed, clear" : "USDFC did not arrive, clear"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className='text-destructive'>
            {hasInvalidAcquisition
              ? "The saved acquisition data is invalid and must be cleared before funding can continue."
              : "Browser storage is unavailable, so funding cannot continue safely."}
          </p>
          {hasInvalidAcquisition && (
            <Button onClick={onClearInvalid} size='compact' type='button' variant='tertiary'>
              Clear invalid saved acquisition
            </Button>
          )}
        </>
      )}
    </div>
  );
}
