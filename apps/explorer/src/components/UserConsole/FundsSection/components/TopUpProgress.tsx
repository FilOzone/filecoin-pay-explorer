"use client";

import Image from "next/image";

export type TopUpStage = "approving" | "swapping" | "bridging" | "switching" | "depositing";

export const TOP_UP_STAGES: readonly { id: TopUpStage; label: string }[] = [
  { id: "approving", label: "Approve" },
  { id: "swapping", label: "Swap" },
  { id: "bridging", label: "Bridge" },
  { id: "switching", label: "Switch network" },
  { id: "depositing", label: "Deposit" },
];

type TopUpProgressProps = {
  failed?: boolean;
  stage: TopUpStage;
};

/**
 * Stage-based progress for the guided top-up: the FOC logo travels a track as
 * the flow advances. Deliberately discrete — bridge duration is unknowable, so
 * a percentage bar would lie.
 */
export function TopUpProgress({ failed = false, stage }: TopUpProgressProps) {
  const stageIndex = Math.max(
    0,
    TOP_UP_STAGES.findIndex((candidate) => candidate.id === stage),
  );
  const fraction = TOP_UP_STAGES.length > 1 ? stageIndex / (TOP_UP_STAGES.length - 1) : 0;

  return (
    <div aria-label='Top-up progress' className='grid gap-1.5' role='status'>
      <div className='relative h-6'>
        <div className='absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted' />
        <div
          className={`absolute left-3 top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-500 ${failed ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `calc((100% - 1.5rem) * ${fraction})` }}
        />
        <Image
          alt=''
          className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ${failed ? "" : "animate-pulse"}`}
          height={24}
          src='/foc-logo-icon.svg'
          style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${fraction})` }}
          width={24}
        />
      </div>
      <ol className='flex justify-between text-[10px] leading-tight'>
        {TOP_UP_STAGES.map((candidate, index) => (
          <li
            className={
              index < stageIndex
                ? "text-primary"
                : index === stageIndex
                  ? failed
                    ? "font-medium text-destructive"
                    : "font-medium text-foreground"
                  : "text-muted-foreground"
            }
            key={candidate.id}
          >
            {candidate.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
