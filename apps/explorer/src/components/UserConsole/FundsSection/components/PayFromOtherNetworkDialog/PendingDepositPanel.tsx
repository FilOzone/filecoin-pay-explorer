import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { formatUsdfcAmount } from "../../data/funding-runway";
import type { PendingSquidDeposit } from "../../data/squid-deposit-tracker";
import { describePendingDeposit } from "../PendingDepositBanner";
import { describeStage, type UiStage } from "./stages";
import { TransactionLink } from "./TransactionLink";

/** A deposit that has been broadcast and is being followed to its Filecoin Pay credit. */
export function PendingDepositPanel({
  activeStage,
  error,
  explorerName,
  explorerUrl,
  hasApproved,
  isBusy,
  isEmbedded,
  onCheckAgain,
  onDismiss,
  pendingDeposit,
}: {
  activeStage: UiStage | null;
  error: string | null;
  explorerName?: string;
  explorerUrl?: string;
  hasApproved: boolean;
  isBusy: boolean;
  isEmbedded: boolean;
  onCheckAgain: () => void;
  onDismiss: () => void;
  pendingDeposit: PendingSquidDeposit;
}) {
  const [isConfirmingDismiss, setConfirmingDismiss] = useState(false);
  return (
    <div className='grid gap-2 rounded-md border p-3' role='status'>
      <p className='inline-flex items-center gap-2 font-medium'>
        {isBusy ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
        Deposit in progress
      </p>
      <p>{`${describePendingDeposit(pendingDeposit)}, arriving as at least ${formatUsdfcAmount(pendingDeposit.minimumDestinationAmount)} USDFC in your Filecoin Pay account.`}</p>
      <p className='text-muted-foreground'>
        {activeStage ? describeStage(activeStage, { hasApproved, isEmbedded }) : "Waiting for the route to settle…"}
      </p>
      <TransactionLink explorerName={explorerName} explorerUrl={explorerUrl} hash={pendingDeposit.transactionHash} />
      {error && (
        <p className='text-destructive' role='alert'>
          {error}
        </p>
      )}
      {isConfirmingDismiss ? (
        <div className='grid gap-2 rounded-md border border-dashed p-3'>
          <p>
            Dismiss this deposit? Only do this after checking the route on Squid or the transaction on{" "}
            {explorerName ?? "the source network explorer"}; the console will stop following it.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              aria-label='Confirm dismissing the deposit'
              onClick={() => {
                setConfirmingDismiss(false);
                onDismiss();
              }}
              size='compact'
              type='button'
              variant='primary'
            >
              Yes, dismiss
            </Button>
            <Button
              aria-label='Keep following the deposit'
              onClick={() => setConfirmingDismiss(false)}
              size='compact'
              type='button'
              variant='ghost'
            >
              Keep waiting
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <Button
            aria-label='Check deposit again'
            disabled={isBusy}
            onClick={onCheckAgain}
            size='compact'
            type='button'
            variant='tertiary'
          >
            Check again
          </Button>
          <Button
            aria-label='Dismiss pending deposit'
            disabled={isBusy}
            onClick={() => setConfirmingDismiss(true)}
            size='compact'
            type='button'
            variant='ghost'
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
