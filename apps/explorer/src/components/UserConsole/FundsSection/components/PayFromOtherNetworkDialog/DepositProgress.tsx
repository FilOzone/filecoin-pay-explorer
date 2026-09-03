import { Check, Loader2 } from "lucide-react";
import { describeProgress, describeStage, type UiStage } from "./stages";
import { TransactionLink } from "./TransactionLink";

/** The running deposit as a timeline, with what the user should do right now underneath. */
export function DepositProgress({
  explorerName,
  explorerUrl,
  hasApproved,
  isEmbedded,
  stage,
  transactionHash,
}: {
  explorerName?: string;
  explorerUrl?: string;
  hasApproved: boolean;
  isEmbedded: boolean;
  stage: UiStage;
  transactionHash: `0x${string}` | null;
}) {
  return (
    <div className='grid gap-3 rounded-md border p-3' role='status'>
      <ol className='grid gap-2'>
        {describeProgress(stage, { hasApproved }).map((step) => (
          <li className='flex items-center gap-3' key={step.label}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                step.state === "current"
                  ? "bg-primary text-primary-foreground"
                  : step.state === "done"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step.state === "done" ? (
                <Check className='h-3.5 w-3.5' />
              ) : step.state === "current" ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <span className='h-1.5 w-1.5 rounded-full bg-current' />
              )}
            </span>
            <span className={step.state === "current" ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
          </li>
        ))}
      </ol>
      <p className='text-muted-foreground'>{describeStage(stage, { hasApproved, isEmbedded })}</p>
      {transactionHash && (
        <TransactionLink explorerName={explorerName} explorerUrl={explorerUrl} hash={transactionHash} />
      )}
    </div>
  );
}
