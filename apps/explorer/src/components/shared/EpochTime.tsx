"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { EPOCH_DURATION } from "@/utils/constants";
import { epochToDate } from "@/utils/formatter";

type EpochTimeGranularity = "date" | "datetime";

interface EpochTimeProps {
  epoch: bigint | number;
  currentEpoch: bigint | number;
  epochDuration?: number;
  granularity?: EpochTimeGranularity;
  showTooltip?: boolean;
  className?: string;
}

const formatEpochLabel = (date: Date, granularity: EpochTimeGranularity): string =>
  granularity === "datetime"
    ? date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

export function EpochTime({
  epoch,
  currentEpoch,
  epochDuration = EPOCH_DURATION,
  granularity = "date",
  showTooltip = true,
  className,
}: EpochTimeProps) {
  const label = formatEpochLabel(epochToDate(epoch, currentEpoch, epochDuration), granularity);

  if (!showTooltip) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex makes the tooltip trigger keyboard-focusable */}
        <span tabIndex={0} className={cn("cursor-help", className)}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top'>Epoch {epoch.toString()}</TooltipContent>
    </Tooltip>
  );
}
