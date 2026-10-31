import clsx from "clsx";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type StepTone = "done" | "todo" | "waiting" | "problem";

const STATUS_CLASSES: Record<StepTone, string> = {
  done: "text-green-700 dark:text-green-400",
  todo: "text-yellow-600 dark:text-yellow-400",
  waiting: "text-yellow-600 dark:text-yellow-400",
  problem: "text-red-700 dark:text-red-400",
};

interface SetupStepProps {
  number: number;
  title: string;
  description: ReactNode;
  status: { tone: StepTone; label: ReactNode };
  children?: ReactNode;
}

/**
 * One step of the setup rail: a numbered marker that becomes a check once the
 * chain shows the step done, joined to the next step by a line that turns
 * green below a done step, so the page reads how far setup has got.
 */
export const SetupStep = ({ number, title, description, status, children }: SetupStepProps) => {
  const done = status.tone === "done";
  return (
    <li className='group/step relative flex gap-4 pb-10 last:pb-0'>
      <span
        aria-hidden
        className={clsx(
          "absolute top-10 bottom-1 left-4 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-500 group-last/step:hidden",
          done ? "bg-green-600" : "bg-border",
        )}
      />
      <span
        aria-hidden
        className={clsx(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums transition-colors duration-500",
          done ? "border-green-600 bg-green-600 text-white" : "border-border bg-background text-foreground",
        )}
      >
        {done ? <Check className='size-4' strokeWidth={3} /> : number}
      </span>
      <div className='min-w-0 flex-1 pt-0.5'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
          <h2 className='text-lg font-medium'>
            <span className='sr-only'>Step {number}: </span>
            {title}
          </h2>
          <p className={clsx("inline-flex items-center gap-1.5 text-sm font-medium", STATUS_CLASSES[status.tone])}>
            {status.tone === "waiting" && <Loader2 aria-hidden className='size-3.5 animate-spin' />}
            {status.label}
          </p>
        </div>
        <div className='mt-1 text-sm text-muted-foreground'>{description}</div>
        {children && <div className='mt-4'>{children}</div>}
      </div>
    </li>
  );
};

/** One labelled row in a step's details list (`<dl>`). */
export const Detail = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className='grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-4'>
    <dt className='text-muted-foreground'>{term}</dt>
    <dd className='min-w-0 text-foreground'>{children}</dd>
  </div>
);
