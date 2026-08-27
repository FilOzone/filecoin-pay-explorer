"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { cn } from "@filecoin-pay/ui/lib/utils";
import type { MockDataset, ProvingStatus } from "../data/mockDatasets";
import { daysBetween, formatDaysAgo } from "../utils/datasetLifecycle";

type BadgeConfig = {
  label: string;
  dotColor: string;
  description: string;
};

const PROVING_CONFIG: Record<ProvingStatus, BadgeConfig> = {
  healthy: {
    label: "Proving",
    dotColor: "bg-brand-300",
    description: "Providers are submitting valid possession proofs on schedule.",
  },
  degraded: {
    label: "Degraded",
    dotColor: "bg-amber-500",
    description: "Some recent proving periods were missed. Data is likely intact; keep an eye on it.",
  },
  faulted: {
    label: "Faulted",
    dotColor: "bg-red-500",
    description: "Providers are failing possession proofs for this dataset. Your data may be at risk.",
  },
};

const DOT_BADGE_TEXT = "text-sm font-medium text-slate-800 dark:text-slate-200";

const DotBadge = ({ config, className }: { config: BadgeConfig; className?: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex makes the tooltip trigger keyboard-focusable */}
      <div tabIndex={0} className={cn("inline-flex cursor-help items-center gap-2", className)}>
        <div className={cn("h-2.5 w-2.5 rounded-full", config.dotColor)} />
        <span className={DOT_BADGE_TEXT}>{config.label}</span>
      </div>
    </TooltipTrigger>
    <TooltipContent side='top'>{config.description}</TooltipContent>
  </Tooltip>
);

export const ProvingBadge = ({ status, className }: { status: ProvingStatus; className?: string }) => (
  <DotBadge config={PROVING_CONFIG[status]} className={className} />
);

const RETRIEVAL_STALE_AFTER_DAYS = 90;

/**
 * Retrieval recency exists only for datasets served through FilBeam. The
 * "unknown" state is deliberate product behavior from the epic: never imply
 * "not accessed" when the honest answer is "we cannot see accesses".
 */
export const RetrievalBadge = ({ dataset, className }: { dataset: MockDataset; className?: string }) => {
  if (!dataset.retrieval) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex makes the tooltip trigger keyboard-focusable */}
          <div tabIndex={0} className={cn("inline-flex cursor-help items-center gap-2", className)}>
            <div className='h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground' />
            <span className='text-sm text-muted-foreground'>No signal</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side='top'>
          Retrieval activity is only visible for datasets served through FilBeam. Enable FilBeam to see when this data
          is actually read.
        </TooltipContent>
      </Tooltip>
    );
  }

  const isIdle = daysBetween(dataset.retrieval.lastRetrievedAt) >= RETRIEVAL_STALE_AFTER_DAYS;
  const config: BadgeConfig = isIdle
    ? {
        label: "Idle",
        dotColor: "bg-amber-500",
        description: `Last retrieved ${formatDaysAgo(dataset.retrieval.lastRetrievedAt)} via FilBeam.`,
      }
    : {
        label: "Active",
        dotColor: "bg-brand-300",
        description: `Last retrieved ${formatDaysAgo(dataset.retrieval.lastRetrievedAt)} via FilBeam (${Math.round(
          dataset.retrieval.successRate * 100,
        )}% success).`,
      };

  return <DotBadge config={config} className={className} />;
};
